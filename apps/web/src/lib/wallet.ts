export interface ClickAccount {
  publicKeyHex: string;
}

export interface ClickSignedDeploy {
  signatureHex: string;
}

export interface ClickProvider {
  connect(): Promise<ClickAccount>;
  signDeploy(input: { deployHashHex: string }): Promise<ClickSignedDeploy>;
}

export class ClickWallet {
  private readonly provider: ClickProvider;

  constructor(provider: ClickProvider) {
    if (!provider) {
      throw new Error('CSPR.click provider missing — install the browser SDK and inject it');
    }
    for (const k of Object.keys(provider as object)) {
      if (k.includes('CSPR_CLOUD_KEY') || k.includes('PRIVATE_KEY')) {
        throw new Error(
          `CSPR.click provider exposes forbidden field "${k}" — frontend must not see privileged secrets`,
        );
      }
    }
    this.provider = provider;
  }

  connect(): Promise<ClickAccount> {
    return this.provider.connect();
  }
  signDeploy(input: { deployHashHex: string }): Promise<ClickSignedDeploy> {
    return this.provider.signDeploy(input);
  }
}
