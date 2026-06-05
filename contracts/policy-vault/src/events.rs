use odra::casper_event_standard;
use odra::casper_types::U256;
use odra::prelude::*;

#[odra::event]
pub struct VaultConfigured {
    pub owner: Address,
    pub token_package: Address,
    pub valid_until_ms: u64,
}

#[odra::event]
pub struct AgentAllowed {
    pub agent: Address,
}

#[odra::event]
pub struct AgentRevoked {
    pub agent: Address,
}

#[odra::event]
pub struct ReceiverAllowed {
    pub receiver: Address,
}

#[odra::event]
pub struct ReceiverRevoked {
    pub receiver: Address,
}

#[odra::event]
pub struct LimitsUpdated {
    pub max_single: U256,
    pub daily_limit: U256,
}

#[odra::event]
pub struct ValidUntilSet {
    pub valid_until_ms: u64,
}

#[odra::event]
pub struct Expired {}

#[odra::event]
pub struct Paid {
    pub agent: Address,
    pub receiver: Address,
    pub amount: U256,
    pub payload_hash: [u8; 32],
    pub paid_total_after: U256,
}
