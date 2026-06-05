#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

use odra::casper_types::U256;
use odra::prelude::*;

pub mod errors;
pub mod events;

use errors::PolicyVaultError;
use events::{
    AgentAllowed, AgentRevoked, Expired, LimitsUpdated, Paid, ReceiverAllowed, ReceiverRevoked,
    ValidUntilSet, VaultConfigured,
};

#[odra::module(
    events = [
        VaultConfigured,
        AgentAllowed,
        AgentRevoked,
        ReceiverAllowed,
        ReceiverRevoked,
        LimitsUpdated,
        ValidUntilSet,
        Expired,
        Paid
    ],
    errors = PolicyVaultError
)]
pub struct PolicyVault {
    owner: Var<Address>,
    token_package: Var<Address>,
    agents: Mapping<Address, bool>,
    receivers: Mapping<Address, bool>,
    max_single: Var<U256>,
    daily_limit: Var<U256>,
    valid_until_ms: Var<u64>,
    day_index: Var<u64>,
    day_spend: Var<U256>,
    paid_total: Var<U256>,
    used_payload_hashes: Mapping<[u8; 32], bool>,
}

#[odra::module]
impl PolicyVault {
    pub fn init(
        &mut self,
        token_package: Address,
        max_single: U256,
        daily_limit: U256,
        valid_until_ms: u64,
    ) {
        let owner = self.env().caller();
        self.owner.set(owner);
        self.token_package.set(token_package);
        self.max_single.set(max_single);
        self.daily_limit.set(daily_limit);
        self.valid_until_ms.set(valid_until_ms);
        self.day_index.set(0);
        self.day_spend.set(U256::zero());
        self.paid_total.set(U256::zero());
        self.env().emit_event(VaultConfigured {
            owner,
            token_package,
            valid_until_ms,
        });
    }

    pub fn allow_agent(&mut self, _agent: Address) {}

    pub fn revoke_agent(&mut self, _agent: Address) {}

    pub fn allow_receiver(&mut self, _receiver: Address) {}

    pub fn revoke_receiver(&mut self, _receiver: Address) {}

    pub fn set_limits(&mut self, _max_single: U256, _daily_limit: U256) {}

    pub fn set_valid_until(&mut self, _new_valid_until_ms: u64) {}

    pub fn expire_now(&mut self) {}

    pub fn pay(&mut self, _receiver: Address, _amount: U256, _payload_hash: [u8; 32]) {}

    pub fn get_owner(&self) -> Address {
        self.owner.get_or_revert_with(PolicyVaultError::NotOwner)
    }

    pub fn get_token_package(&self) -> Address {
        self.token_package
            .get_or_revert_with(PolicyVaultError::Cep18CallFailed)
    }

    pub fn is_agent(&self, who: Address) -> bool {
        self.agents.get_or_default(&who)
    }

    pub fn is_receiver_allowed(&self, who: Address) -> bool {
        self.receivers.get_or_default(&who)
    }

    pub fn get_limits(&self) -> (U256, U256) {
        (
            self.max_single.get_or_default(),
            self.daily_limit.get_or_default(),
        )
    }

    pub fn get_valid_until_ms(&self) -> u64 {
        self.valid_until_ms.get_or_default()
    }

    pub fn get_day_state(&self) -> (u64, U256, U256) {
        (
            self.day_index.get_or_default(),
            self.day_spend.get_or_default(),
            self.paid_total.get_or_default(),
        )
    }

    pub fn is_payload_used(&self, payload_hash: [u8; 32]) -> bool {
        self.used_payload_hashes.get_or_default(&payload_hash)
    }
}
