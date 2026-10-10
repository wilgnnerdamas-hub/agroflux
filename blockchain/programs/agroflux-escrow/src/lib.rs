//! AgroFlux — programa de escrow da cessão tokenizada (contrato v1.1, §6.4). SIMULAÇÃO NA DEVNET.
//!
//! Uma única instrução, `settle`, faz a liquidação atômica:
//! 1. confere os termos (token da cessão único e sem autoridade de mint, moeda com 2 casas, valor, carteiras);
//! 2. transfere o token da cessão do distribuidor para o financiador;
//! 3. transfere `amount` da moeda de teste (tBRL-DEMO) do financiador para o distribuidor;
//! 4. grava o registro da liquidação (PDA por token da cessão), o que impede liquidar o mesmo token duas vezes.
//!
//! Se qualquer passo falhar, a transação inteira é revertida: nenhuma perna acontece.
//! Token e moeda não têm valor. Não é oferta de investimento nem cessão jurídica.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa");

pub const SETTLEMENT_SEED: &[u8] = b"settlement";
pub const SETTLEMENT_DECIMALS: u8 = 2;

#[program]
pub mod agroflux_escrow {
    use super::*;

    pub fn settle(ctx: Context<Settle>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let asset_mint = &ctx.accounts.asset_mint;
        require!(asset_mint.supply == 1 && asset_mint.decimals == 0, EscrowError::AssetNotUnique);
        require!(asset_mint.mint_authority.is_none(), EscrowError::MintAuthorityNotRevoked);
        require!(
            ctx.accounts.settlement_mint.decimals == SETTLEMENT_DECIMALS,
            EscrowError::InvalidSettlementMint
        );

        // Perna 1: token da cessão, distribuidor → financiador.
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.asset_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.distributor_asset.to_account_info(),
                    mint: ctx.accounts.asset_mint.to_account_info(),
                    to: ctx.accounts.funder_asset.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            ),
            1,
            0,
        )?;

        // Perna 2: tBRL-DEMO, financiador → distribuidor. Sem saldo, o programa de token falha
        // e a perna 1 é desfeita junto (não há conferência prévia de saldo de propósito: os testes
        // provam a reversão).
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.settlement_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.funder_settlement.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.distributor_settlement.to_account_info(),
                    authority: ctx.accounts.funder.to_account_info(),
                },
            ),
            amount,
            SETTLEMENT_DECIMALS,
        )?;

        let settled_at = Clock::get()?.unix_timestamp;
        ctx.accounts.settlement.set_inner(Settlement {
            asset_mint: asset_mint.key(),
            settlement_mint: ctx.accounts.settlement_mint.key(),
            distributor: ctx.accounts.distributor.key(),
            funder: ctx.accounts.funder.key(),
            amount,
            settled_at,
            bump: ctx.bumps.settlement,
        });
        emit!(Settled {
            asset_mint: asset_mint.key(),
            settlement_mint: ctx.accounts.settlement_mint.key(),
            distributor: ctx.accounts.distributor.key(),
            funder: ctx.accounts.funder.key(),
            amount,
            settled_at,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Paga taxas e aluguel das contas novas (carteira do backend).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Carteira de demonstração "distribuidor demo".
    pub distributor: Signer<'info>,
    /// Carteira de demonstração "financiador demo".
    #[account(constraint = funder.key() != distributor.key() @ EscrowError::SameParty)]
    pub funder: Signer<'info>,

    /// Token da cessão: Token-2022, supply 1, decimals 0.
    #[account(mint::token_program = asset_token_program)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Moeda de teste tBRL-DEMO (2 casas decimais).
    #[account(mint::token_program = settlement_token_program)]
    pub settlement_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = distributor,
        associated_token::token_program = asset_token_program,
        constraint = distributor_asset.amount == 1 @ EscrowError::AssetNotHeld,
    )]
    pub distributor_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = funder,
        associated_token::token_program = asset_token_program,
    )]
    pub funder_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = settlement_mint,
        associated_token::authority = funder,
        associated_token::token_program = settlement_token_program,
    )]
    pub funder_settlement: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = settlement_mint,
        associated_token::authority = distributor,
        associated_token::token_program = settlement_token_program,
    )]
    pub distributor_settlement: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Registro da liquidação. `init` falha se o token já foi liquidado.
    #[account(
        init,
        payer = payer,
        space = 8 + Settlement::INIT_SPACE,
        seeds = [SETTLEMENT_SEED, asset_mint.key().as_ref()],
        bump,
    )]
    pub settlement: Account<'info, Settlement>,

    pub asset_token_program: Program<'info, Token2022>,
    pub settlement_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Settlement {
    pub asset_mint: Pubkey,
    pub settlement_mint: Pubkey,
    pub distributor: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
    pub settled_at: i64,
    pub bump: u8,
}

#[event]
pub struct Settled {
    pub asset_mint: Pubkey,
    pub settlement_mint: Pubkey,
    pub distributor: Pubkey,
    pub funder: Pubkey,
    pub amount: u64,
    pub settled_at: i64,
}

#[error_code]
pub enum EscrowError {
    #[msg("O valor da liquidação precisa ser maior que zero.")]
    InvalidAmount,
    #[msg("O token da cessão precisa ter supply 1 e 0 casas decimais.")]
    AssetNotUnique,
    #[msg("A autoridade de mint do token da cessão precisa estar removida.")]
    MintAuthorityNotRevoked,
    #[msg("A moeda de liquidação precisa ter 2 casas decimais.")]
    InvalidSettlementMint,
    #[msg("O distribuidor não detém o token da cessão.")]
    AssetNotHeld,
    #[msg("Distribuidor e financiador precisam ser carteiras diferentes.")]
    SameParty,
}
