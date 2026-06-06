import type {
  CasperAccountAddressHex,
  CasperCaip2ChainId,
  Cep18PackageHashHex,
} from './schemas/primitives.schema.js';

/** §3A.1 — per-asset config for the `cep18-x402` kind. */
export interface Cep18X402AssetConfig {
  kind: 'cep18-x402';
  chainId: CasperCaip2ChainId;
  asset: Cep18PackageHashHex;
  receiver: CasperAccountAddressHex;
  name: string;
  version: string;
  decimals: number;
  minPaymentAtomic: string;
  maxPaymentAtomic: string;
  maxTimeoutSeconds: number;
  requiresEntryPoint: 'transfer_with_authorization';
}

export type X402GatewayMode = 'mock' | 'simulate' | 'testnet' | 'mainnet_sponsored';

export interface X402GatewayConfig {
  facilitatorUrl: string;
  facilitatorApiKey?: string;
  mode: X402GatewayMode;
  assets: Cep18X402AssetConfig[];
}
