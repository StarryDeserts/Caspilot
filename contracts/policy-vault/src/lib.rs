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
        self.validate_limits(max_single, daily_limit);
        self.validate_future_valid_until(valid_until_ms);

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

    pub fn allow_agent(&mut self, agent: Address) {
        self.require_owner();
        self.agents.set(&agent, true);
        self.env().emit_event(AgentAllowed { agent });
    }

    pub fn revoke_agent(&mut self, agent: Address) {
        self.require_owner();
        self.agents.set(&agent, false);
        self.env().emit_event(AgentRevoked { agent });
    }

    pub fn allow_receiver(&mut self, receiver: Address) {
        self.require_owner();
        self.receivers.set(&receiver, true);
        self.env().emit_event(ReceiverAllowed { receiver });
    }

    pub fn revoke_receiver(&mut self, receiver: Address) {
        self.require_owner();
        self.receivers.set(&receiver, false);
        self.env().emit_event(ReceiverRevoked { receiver });
    }

    pub fn set_limits(&mut self, max_single: U256, daily_limit: U256) {
        self.require_owner();
        self.validate_limits(max_single, daily_limit);
        self.max_single.set(max_single);
        self.daily_limit.set(daily_limit);
        self.env().emit_event(LimitsUpdated {
            max_single,
            daily_limit,
        });
    }

    pub fn set_valid_until(&mut self, new_valid_until_ms: u64) {
        self.require_owner();
        self.validate_future_valid_until(new_valid_until_ms);
        self.valid_until_ms.set(new_valid_until_ms);
        self.env().emit_event(ValidUntilSet {
            valid_until_ms: new_valid_until_ms,
        });
    }

    pub fn expire_now(&mut self) {
        self.require_owner();
        let now_ms = self.current_time_ms();
        self.valid_until_ms.set(now_ms);
        self.env().emit_event(Expired {});
    }

    pub fn pay(&mut self, receiver: Address, amount: U256, payload_hash: [u8; 32]) {
        let caller = self.env().caller();
        if !self.agents.get_or_default(&caller) {
            self.revert(PolicyVaultError::AgentNotAllowed);
        }
        if !self.receivers.get_or_default(&receiver) {
            self.revert(PolicyVaultError::ReceiverNotAllowed);
        }

        let now_ms = self.current_time_ms();
        if now_ms >= self.valid_until_ms.get_or_default() {
            self.revert(PolicyVaultError::VaultExpired);
        }
        if amount > self.max_single.get_or_default() {
            self.revert(PolicyVaultError::AmountAboveMax);
        }

        let new_day = now_ms / 86_400_000;
        let current_day = self.day_index.get_or_default();
        let current_day_spend = if new_day != current_day {
            U256::zero()
        } else {
            self.day_spend.get_or_default()
        };
        let Some(new_day_spend) = current_day_spend.checked_add(amount) else {
            self.revert(PolicyVaultError::ArithmeticOverflow);
        };
        if new_day_spend > self.daily_limit.get_or_default() {
            self.revert(PolicyVaultError::DayLimitExceeded);
        }
        if self.used_payload_hashes.get_or_default(&payload_hash) {
            self.revert(PolicyVaultError::NonceAlreadyUsed);
        }

        self.execute_token_transfer(receiver, amount);
        let Some(paid_total_after) = self.paid_total.get_or_default().checked_add(amount) else {
            self.revert(PolicyVaultError::ArithmeticOverflow);
        };

        self.day_index.set(new_day);
        self.day_spend.set(new_day_spend);
        self.paid_total.set(paid_total_after);
        self.used_payload_hashes.set(&payload_hash, true);
        self.env().emit_event(Paid {
            agent: caller,
            receiver,
            amount,
            payload_hash,
            paid_total_after,
        });
    }

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

    fn require_owner(&self) {
        if self.env().caller() != self.owner.get_or_revert_with(PolicyVaultError::NotOwner) {
            self.revert(PolicyVaultError::NotOwner);
        }
    }

    fn current_time_ms(&self) -> u64 {
        self.env().get_block_time_millis()
    }

    fn validate_limits(&self, max_single: U256, daily_limit: U256) {
        if max_single.is_zero() || daily_limit.is_zero() || max_single > daily_limit {
            self.revert(PolicyVaultError::AmountAboveMax);
        }
    }

    fn validate_future_valid_until(&self, valid_until_ms: u64) {
        if valid_until_ms <= self.current_time_ms() {
            self.revert(PolicyVaultError::InvalidValidUntil);
        }
    }

    fn execute_token_transfer(&mut self, _receiver: Address, _amount: U256) {}
}
