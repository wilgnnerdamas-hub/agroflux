import type {
  AssignmentStatus,
  ChainStatus,
  DebtorConfirmationStatus,
  DocumentKind,
  EventType,
  FunderType,
  ProductCategory,
  ReceivableStatus,
} from "./types";

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  created: "Cadastrado",
  registration_pending: "Registro pendente",
  registered: "Registrado na Devnet",
  registration_failed: "Falha no registro",
  offer_selected: "Oferta simulada selecionada",
  assignment_pending: "Cessão em liquidação",
  assigned: "Cessão tokenizada (simulada)",
  assignment_failed: "Falha na cessão",
};

// v1.1 (§4.5)
export const DEBTOR_CONFIRMATION_STATUS_LABEL: Record<DebtorConfirmationStatus, string> = {
  none: "Confirmação não solicitada",
  requested: "Aguardando o sacado",
  confirmed: "Confirmado pelo sacado (simulado)",
  declined: "Recusado pelo sacado (simulado)",
};

// v1.1 (§4.6)
export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  none: "Sem cessão",
  pending: "Em liquidação",
  settled: "Liquidada (simulação)",
  failed: "Falhou",
};

export const CHAIN_STATUS_LABEL: Record<ChainStatus, string> = {
  none: "Não registrado",
  pending: "Aguardando confirmação",
  confirmed: "Confirmado",
  failed: "Falhou",
};

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  fertilizer: "Fertilizante",
  crop_protection: "Defensivo",
  seed: "Semente",
  other: "Outro",
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  test_invoice: "Nota fiscal (teste)",
  test_contract: "Contrato (teste)",
  other: "Outro",
};

export const FUNDER_TYPE_LABEL: Record<FunderType, string> = {
  simulated_fidc: "FIDC (simulado)",
  simulated_bank: "Banco (simulado)",
  simulated_cooperative: "Cooperativa (simulada)",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  receivable_created: "Recebível cadastrado",
  document_attached: "Documento anexado",
  chain_registration_requested: "Registro solicitado",
  chain_registration_confirmed: "Registro confirmado na Devnet",
  chain_registration_failed: "Falha no registro",
  offers_generated: "Ofertas simuladas geradas",
  offer_selected: "Oferta simulada selecionada",
  debtor_confirmation_requested: "Confirmação solicitada ao sacado",
  debtor_confirmed: "Confirmação do sacado registrada na Devnet",
  debtor_confirmation_chain_failed: "Falha ao registrar a confirmação",
  debtor_declined: "Sacado recusou",
  assignment_requested: "Cessão solicitada",
  assignment_token_minted: "Token da cessão criado",
  assignment_settled: "Cessão liquidada (simulação)",
  assignment_failed: "Falha na cessão",
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const OFFERS_DISCLAIMER_FALLBACK =
  "Ofertas fictícias geradas para demonstração. Não há financiador real, proposta vinculante ou movimentação financeira.";
