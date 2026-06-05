use odra::casper_types::U256;
use odra::host::Deployer;
use policy_vault::errors::PolicyVaultError;
use policy_vault::events::{
    AgentAllowed, AgentRevoked, Expired, LimitsUpdated, Paid, ReceiverAllowed, ReceiverRevoked,
    ValidUntilSet, VaultConfigured,
};
use policy_vault::{PolicyVault, PolicyVaultInitArgs};

fn u256(value: u64) -> U256 {
    U256::from(value)
}

#[test]
fn init_stores_owner_token_limits_valid_until_and_initial_day_state() {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let token_package = env.get_account(1);
    let max_single = u256(1_000);
    let daily_limit = u256(10_000);
    let valid_until_ms = 9_999_999_999_999u64;

    let vault = PolicyVault::deploy(
        &env,
        PolicyVaultInitArgs {
            token_package,
            max_single,
            daily_limit,
            valid_until_ms,
        },
    );

    assert_eq!(vault.get_owner(), owner);
    assert_eq!(vault.get_token_package(), token_package);
    assert_eq!(vault.get_limits(), (max_single, daily_limit));
    assert_eq!(vault.get_valid_until_ms(), valid_until_ms);
    assert_eq!(vault.get_day_state(), (0, U256::zero(), U256::zero()));
}

#[test]
fn mappings_default_false_after_init() {
    let env = odra_test::env();
    let token_package = env.get_account(1);
    let unknown = env.get_account(2);
    let payload_hash = [7u8; 32];

    let vault = PolicyVault::deploy(
        &env,
        PolicyVaultInitArgs {
            token_package,
            max_single: u256(1),
            daily_limit: u256(2),
            valid_until_ms: 3,
        },
    );

    assert!(!vault.is_agent(unknown));
    assert!(!vault.is_receiver_allowed(unknown));
    assert!(!vault.is_payload_used(payload_hash));
}

#[test]
fn error_discriminants_match_policy_vault_spec() {
    assert_eq!(PolicyVaultError::NotOwner as u16, 1);
    assert_eq!(PolicyVaultError::AgentNotAllowed as u16, 2);
    assert_eq!(PolicyVaultError::ReceiverNotAllowed as u16, 3);
    assert_eq!(PolicyVaultError::AmountAboveMax as u16, 4);
    assert_eq!(PolicyVaultError::DayLimitExceeded as u16, 5);
    assert_eq!(PolicyVaultError::VaultExpired as u16, 6);
    assert_eq!(PolicyVaultError::NonceAlreadyUsed as u16, 7);
    assert_eq!(PolicyVaultError::InsufficientVaultBalance as u16, 8);
    assert_eq!(PolicyVaultError::ArithmeticOverflow as u16, 9);
    assert_eq!(PolicyVaultError::InvalidValidUntil as u16, 10);
    assert_eq!(PolicyVaultError::Cep18CallFailed as u16, 11);
}

#[test]
fn event_structs_construct_with_expected_public_field_types() {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let token_package = env.get_account(1);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let amount = u256(42);
    let payload_hash = [4u8; 32];

    let _ = VaultConfigured {
        owner,
        token_package,
        valid_until_ms: 5,
    };
    let _ = AgentAllowed { agent };
    let _ = AgentRevoked { agent };
    let _ = ReceiverAllowed { receiver };
    let _ = ReceiverRevoked { receiver };
    let _ = LimitsUpdated {
        max_single: amount,
        daily_limit: u256(100),
    };
    let _ = ValidUntilSet { valid_until_ms: 6 };
    let _ = Expired {};
    let _ = Paid {
        agent,
        receiver,
        amount,
        payload_hash,
        paid_total_after: amount,
    };
}

#[test]
fn admin_and_pay_signatures_are_callable_with_valid_policy_setup() {
    let env = odra_test::env();
    let owner = env.get_account(0);
    let token_package = env.get_account(1);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);

    let mut vault = PolicyVault::deploy(
        &env,
        PolicyVaultInitArgs {
            token_package,
            max_single: u256(1),
            daily_limit: u256(2),
            valid_until_ms: 3,
        },
    );

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);
    vault.pay(receiver, u256(1), [9u8; 32]);

    env.set_caller(owner);
    vault.revoke_agent(agent);
    vault.revoke_receiver(receiver);
    vault.set_limits(u256(4), u256(5));
    vault.set_valid_until(6);
    vault.expire_now();
}
