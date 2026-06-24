import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnChainProofPanel } from '../src/components/OnChainProofPanel.js';

const HASH = 'ab'.repeat(32); // 64-hex deploy hash

describe('OnChainProofPanel', () => {
  it('renders the panel heading', () => {
    render(<OnChainProofPanel deployHash={HASH} />);
    expect(screen.getByRole('heading', { name: /on-chain proof/i })).toBeDefined();
  });

  it('shows a verified proof linking to the testnet explorer when a deploy hash exists', () => {
    const { container } = render(<OnChainProofPanel deployHash={HASH} />);
    expect(container.querySelector('.proof.verified')).not.toBeNull();
    expect(container.textContent).toContain(HASH);
    const link = screen.getByRole('link', { name: /view on testnet/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`https://testnet.cspr.live/deploy/${HASH}`);
  });

  it('links the /transaction/ explorer path and labels it a transaction when kind=transaction', () => {
    // A Casper 2.0 native transfer finalizes as a TransactionV1. Linking /deploy/<hash>
    // for it would 404 on cspr.live — the kind (chain-resolved, from confirm-onchain)
    // must route /transaction/<hash> and relabel the proof header accordingly.
    const { container } = render(<OnChainProofPanel deployHash={HASH} kind="transaction" />);
    const link = screen.getByRole('link', { name: /view on testnet/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`https://testnet.cspr.live/transaction/${HASH}`);
    expect(container.querySelector('.proof-title')?.textContent).toBe('transaction');
  });

  it('defaults to the /deploy/ explorer path (legacy) when no kind is given', () => {
    const { container } = render(<OnChainProofPanel deployHash={HASH} />);
    const link = screen.getByRole('link', { name: /view on testnet/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`https://testnet.cspr.live/deploy/${HASH}`);
    expect(container.querySelector('.proof-title')?.textContent).toBe('deploy');
  });

  it('offers a copy button for the deploy hash', () => {
    render(<OnChainProofPanel deployHash={HASH} />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeDefined();
  });

  it('shows a pending state with no link when there is no deploy hash', () => {
    const { container } = render(<OnChainProofPanel />);
    expect(container.querySelector('.proof.pending')).not.toBeNull();
    expect(container.textContent?.toLowerCase()).toContain('awaiting broadcast');
    expect(container.querySelector('a')).toBeNull();
  });

  it('never fabricates an unverified block number (audit honesty)', () => {
    const { container } = render(<OnChainProofPanel deployHash={HASH} />);
    expect(container.textContent).not.toContain('2,184,773');
  });
});
