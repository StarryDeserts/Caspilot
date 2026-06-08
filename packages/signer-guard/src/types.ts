import type {
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  CasperPublicKeyHex,
  Cep18PackageHashHex,
  Hex64,
} from '@caspilot/x402';

export const SIGNER_ROLES = ['user_cspr_click', 'local_dev', 'demo_sponsored'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export type ReceiverPolicy = 'deny_all' | 'allowlist' | 'allow_any_with_manual_approval';

export interface SignerGuardPolicy {
  signerRole: SignerRole;
  allowedChainIds: CasperCaip2ChainId[];
  allowedContractPackages: Cep18PackageHashHex[];
  allowedTokens: Cep18PackageHashHex[];
  receiverPolicy: ReceiverPolicy;
  allowedReceivers: CasperAccountAddressHex[];
  maxSinglePaymentAtomic: string;
  perDayCapAtomic: string;
  requireTraceId: boolean;
}

export interface UnsignedDeployEnvelope {
  headerJson: unknown;
  bodyHashHex: Hex64;
  payloadHex: string;
}

export interface SignRequest {
  policy: SignerGuardPolicy;
  intentId: string;
  traceId: string;
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  unsignedDeploy: UnsignedDeployEnvelope;
  intendedContractPackage: Cep18PackageHashHex;
  intendedReceiver: CasperAccountAddressHex;
  intendedToken: Cep18PackageHashHex;
  intendedAmountAtomic: string;
  intendedChainId: CasperCaip2ChainId;
}

export type SignDenial =
  | 'signer_role_mismatch'
  | 'trace_id_missing'
  | 'chain_not_allowed'
  | 'package_not_allowed'
  | 'token_not_allowed'
  | 'receiver_not_allowed'
  | 'amount_above_single_cap'
  | 'day_cap_exceeded'
  | 'reservation_conflict'
  | 'signer_failed';

export type SignResult =
  | { ok: true; signatureHex: string; reservationId: string; policyDigest: string }
  | { ok: false; reason: SignDenial; policyDigest?: string };

export interface RawSigner {
  signerRole: SignerRole;
  signerPk: CasperPublicKeyHex;
  sign(unsignedDeploy: UnsignedDeployEnvelope): Promise<{ signatureHex: string }>;
}
