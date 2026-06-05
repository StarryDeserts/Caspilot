use odra::casper_types::U256;
use odra::host::Deployer;
use odra::prelude::OdraResult;
use policy_vault::errors::PolicyVaultError;
use policy_vault::events::Paid;
use policy_vault::{PolicyVault, PolicyVaultInitArgs};

const DAY_MS: u64 = 86_400_000;
const FUTURE_MS: u64 = DAY_MS * 10;

fn u256(value: u64) -> U256 {
    U256::from(value)
}

fn deploy_vault_with_limits(
    env: &odra::host::HostEnv,
    max_single: U256,
    daily_limit: U256,
) -> policy_vault::PolicyVaultHostRef {
    PolicyVault::deploy(
        env,
        PolicyVaultInitArgs {
            token_package: env.get_account(1),
            max_single,
            daily_limit,
            valid_until_ms: FUTURE_MS,
        },
    )
}

fn deploy_configured_vault(env: &odra::host::HostEnv) -> policy_vault::PolicyVaultHostRef {
    let mut vault = deploy_vault_with_limits(env, u256(100), u256(1_000));
    vault.allow_agent(env.get_account(2));
    vault.allow_receiver(env.get_account(3));
    vault
}

fn assert_user_error<T>(result: OdraResult<T>, expected: PolicyVaultError) {
    let Some(error) = result.err() else {
        panic!("expected PolicyVaultError code {}", expected as u16);
    };

    assert_eq!(error.code(), expected as u16);
}

fn advance_to_next_day(env: &odra::host::HostEnv) {
    let now_ms = env.block_time_millis();
    let next_day_start = ((now_ms / DAY_MS) + 1) * DAY_MS;
    env.advance_block_time(next_day_start - now_ms);
}

#[test]
fn pay_happy_path_marks_payload_updates_spend_and_emits_paid() {
    let env = odra_test::env();
    let mut vault = deploy_configured_vault(&env);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let amount = u256(42);
    let payload_hash = [1u8; 32];
    let expected_day = env.block_time_millis() / DAY_MS;

    env.set_caller(agent);
    vault.pay(receiver, amount, payload_hash);

    assert!(vault.is_payload_used(payload_hash));
    assert_eq!(vault.get_day_state(), (expected_day, amount, amount));
    assert!(env.emitted_event(
        &vault,
        &Paid {
            agent,
            receiver,
            amount,
            payload_hash,
            paid_total_after: amount,
        }
    ));
}

#[test]
fn pay_reverts_agent_not_allowed_when_caller_is_not_allowlisted() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, u256(100), u256(1_000));
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let payload_hash = [2u8; 32];

    vault.allow_receiver(receiver);
    env.set_caller(agent);

    assert_user_error(
        vault.try_pay(receiver, u256(1), payload_hash),
        PolicyVaultError::AgentNotAllowed,
    );
    assert!(!vault.is_payload_used(payload_hash));
    assert_eq!(vault.get_day_state(), (0, U256::zero(), U256::zero()));
}

#[test]
fn pay_reverts_receiver_not_allowed_when_receiver_is_not_allowlisted() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, u256(100), u256(1_000));
    let agent = env.get_account(2);
    let receiver = env.get_account(3);

    vault.allow_agent(agent);
    env.set_caller(agent);

    assert_user_error(
        vault.try_pay(receiver, u256(1), [3u8; 32]),
        PolicyVaultError::ReceiverNotAllowed,
    );
}

#[test]
fn pay_reverts_vault_expired_when_now_is_valid_until() {
    let env = odra_test::env();
    let mut vault = deploy_configured_vault(&env);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);

    vault.expire_now();
    env.set_caller(agent);

    assert_user_error(
        vault.try_pay(receiver, u256(1), [4u8; 32]),
        PolicyVaultError::VaultExpired,
    );
}

#[test]
fn pay_reverts_amount_above_max_when_amount_exceeds_max_single() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, u256(10), u256(100));
    let agent = env.get_account(2);
    let receiver = env.get_account(3);

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);

    assert_user_error(
        vault.try_pay(receiver, u256(11), [5u8; 32]),
        PolicyVaultError::AmountAboveMax,
    );
}

#[test]
fn pay_reverts_day_limit_exceeded_when_same_day_spend_would_exceed_limit() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, u256(100), u256(100));
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let rejected_hash = [7u8; 32];

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);
    vault.pay(receiver, u256(60), [6u8; 32]);

    assert_user_error(
        vault.try_pay(receiver, u256(41), rejected_hash),
        PolicyVaultError::DayLimitExceeded,
    );
    assert!(!vault.is_payload_used(rejected_hash));
    assert_eq!(vault.get_day_state(), (0, u256(60), u256(60)));
}

#[test]
fn pay_reverts_nonce_already_used_when_payload_hash_repeats() {
    let env = odra_test::env();
    let mut vault = deploy_configured_vault(&env);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let payload_hash = [8u8; 32];

    env.set_caller(agent);
    vault.pay(receiver, u256(1), payload_hash);

    assert_user_error(
        vault.try_pay(receiver, u256(1), payload_hash),
        PolicyVaultError::NonceAlreadyUsed,
    );
    assert_eq!(vault.get_day_state(), (0, u256(1), u256(1)));
}

#[test]
fn pay_rolls_day_spend_over_on_new_utc_millisecond_day() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, u256(100), u256(100));
    let agent = env.get_account(2);
    let receiver = env.get_account(3);

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);
    vault.pay(receiver, u256(100), [9u8; 32]);

    advance_to_next_day(&env);
    let new_day = env.block_time_millis() / DAY_MS;
    vault.pay(receiver, u256(100), [10u8; 32]);

    assert_eq!(vault.get_day_state(), (new_day, u256(100), u256(200)));
}

#[test]
fn pay_reverts_arithmetic_overflow_when_day_spend_checked_add_overflows() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, U256::MAX, U256::MAX);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let rejected_hash = [12u8; 32];

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);
    vault.pay(receiver, U256::MAX, [11u8; 32]);

    assert_user_error(
        vault.try_pay(receiver, u256(1), rejected_hash),
        PolicyVaultError::ArithmeticOverflow,
    );
    assert!(!vault.is_payload_used(rejected_hash));
    assert_eq!(vault.get_day_state(), (0, U256::MAX, U256::MAX));
}

#[test]
fn pay_reverts_arithmetic_overflow_when_paid_total_checked_add_overflows() {
    let env = odra_test::env();
    let mut vault = deploy_vault_with_limits(&env, U256::MAX, U256::MAX);
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    let rejected_hash = [14u8; 32];

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    env.set_caller(agent);
    vault.pay(receiver, U256::MAX, [13u8; 32]);

    advance_to_next_day(&env);

    assert_user_error(
        vault.try_pay(receiver, u256(1), rejected_hash),
        PolicyVaultError::ArithmeticOverflow,
    );
    assert!(!vault.is_payload_used(rejected_hash));
    assert_eq!(vault.get_day_state(), (0, U256::MAX, U256::MAX));
}
