use odra::casper_types::U256;
use odra::host::Deployer;
use odra::prelude::OdraResult;
use policy_vault::errors::PolicyVaultError;
use policy_vault::events::{
    AgentAllowed, AgentRevoked, Expired, LimitsUpdated, ReceiverAllowed, ReceiverRevoked,
    ValidUntilSet,
};
use policy_vault::{PolicyVault, PolicyVaultInitArgs};

const FUTURE_MS: u64 = 1_000_000;

fn u256(value: u64) -> U256 {
    U256::from(value)
}

fn init_args(token_package: odra::prelude::Address) -> PolicyVaultInitArgs {
    PolicyVaultInitArgs {
        token_package,
        max_single: u256(100),
        daily_limit: u256(1_000),
        valid_until_ms: FUTURE_MS,
    }
}

fn deploy_vault(env: &odra::host::HostEnv) -> policy_vault::PolicyVaultHostRef {
    PolicyVault::deploy(env, init_args(env.get_account(1)))
}

fn assert_user_error<T>(result: OdraResult<T>, expected: PolicyVaultError) {
    let Some(error) = result.err() else {
        panic!("expected PolicyVaultError code {}", expected as u16);
    };

    assert_eq!(error.code(), expected as u16);
}

#[test]
fn non_owner_calling_each_admin_method_reverts_not_owner() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);
    let non_owner = env.get_account(2);
    let agent = env.get_account(3);
    let receiver = env.get_account(4);

    env.set_caller(non_owner);

    assert_user_error(vault.try_allow_agent(agent), PolicyVaultError::NotOwner);
    assert_user_error(vault.try_revoke_agent(agent), PolicyVaultError::NotOwner);
    assert_user_error(
        vault.try_allow_receiver(receiver),
        PolicyVaultError::NotOwner,
    );
    assert_user_error(
        vault.try_revoke_receiver(receiver),
        PolicyVaultError::NotOwner,
    );
    assert_user_error(
        vault.try_set_limits(u256(200), u256(2_000)),
        PolicyVaultError::NotOwner,
    );
    assert_user_error(
        vault.try_set_valid_until(FUTURE_MS + 1),
        PolicyVaultError::NotOwner,
    );
    assert_user_error(vault.try_expire_now(), PolicyVaultError::NotOwner);
}

#[test]
fn owner_allow_and_revoke_agent_updates_mapping_and_emits_events() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);
    let agent = env.get_account(2);

    vault.allow_agent(agent);

    assert!(vault.is_agent(agent));
    assert!(env.emitted_event(&vault, &AgentAllowed { agent }));

    vault.revoke_agent(agent);

    assert!(!vault.is_agent(agent));
    assert!(env.emitted_event(&vault, &AgentRevoked { agent }));
}

#[test]
fn owner_allow_and_revoke_receiver_updates_mapping_and_emits_events() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);
    let receiver = env.get_account(2);

    vault.allow_receiver(receiver);

    assert!(vault.is_receiver_allowed(receiver));
    assert!(env.emitted_event(&vault, &ReceiverAllowed { receiver }));

    vault.revoke_receiver(receiver);

    assert!(!vault.is_receiver_allowed(receiver));
    assert!(env.emitted_event(&vault, &ReceiverRevoked { receiver }));
}

#[test]
fn owner_set_limits_updates_limits_and_emits_event() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);
    let max_single = u256(250);
    let daily_limit = u256(2_500);

    vault.set_limits(max_single, daily_limit);

    assert_eq!(vault.get_limits(), (max_single, daily_limit));
    assert!(env.emitted_event(
        &vault,
        &LimitsUpdated {
            max_single,
            daily_limit,
        }
    ));
}

#[test]
fn set_limits_reverts_amount_above_max_for_invalid_limit_shape() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);

    assert_user_error(
        vault.try_set_limits(U256::zero(), u256(100)),
        PolicyVaultError::AmountAboveMax,
    );
    assert_user_error(
        vault.try_set_limits(u256(100), U256::zero()),
        PolicyVaultError::AmountAboveMax,
    );
    assert_user_error(
        vault.try_set_limits(u256(101), u256(100)),
        PolicyVaultError::AmountAboveMax,
    );
}

#[test]
fn init_reverts_amount_above_max_for_invalid_limit_shape() {
    let env = odra_test::env();
    let token_package = env.get_account(1);

    for (max_single, daily_limit) in [
        (U256::zero(), u256(100)),
        (u256(100), U256::zero()),
        (u256(101), u256(100)),
    ] {
        let result = PolicyVault::try_deploy(
            &env,
            PolicyVaultInitArgs {
                token_package,
                max_single,
                daily_limit,
                valid_until_ms: FUTURE_MS,
            },
        );

        assert_user_error(result, PolicyVaultError::AmountAboveMax);
    }
}

#[test]
fn set_valid_until_can_shorten_and_extend_to_future_values_and_emits_events() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);
    let shortened = FUTURE_MS / 2;
    let extended = FUTURE_MS * 2;

    vault.set_valid_until(shortened);

    assert_eq!(vault.get_valid_until_ms(), shortened);
    assert!(env.emitted_event(
        &vault,
        &ValidUntilSet {
            valid_until_ms: shortened,
        }
    ));

    vault.set_valid_until(extended);

    assert_eq!(vault.get_valid_until_ms(), extended);
    assert!(env.emitted_event(
        &vault,
        &ValidUntilSet {
            valid_until_ms: extended,
        }
    ));
}

#[test]
fn set_valid_until_reverts_invalid_valid_until_when_new_value_is_not_future() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);

    env.advance_block_time(250);

    assert_user_error(
        vault.try_set_valid_until(env.block_time_millis()),
        PolicyVaultError::InvalidValidUntil,
    );
    assert_user_error(
        vault.try_set_valid_until(env.block_time_millis() - 1),
        PolicyVaultError::InvalidValidUntil,
    );
}

#[test]
fn init_reverts_invalid_valid_until_when_valid_until_le_now_ms() {
    let env = odra_test::env();
    let token_package = env.get_account(1);

    env.advance_block_time(250);

    for valid_until_ms in [env.block_time_millis(), env.block_time_millis() - 1] {
        let result = PolicyVault::try_deploy(
            &env,
            PolicyVaultInitArgs {
                token_package,
                max_single: u256(100),
                daily_limit: u256(1_000),
                valid_until_ms,
            },
        );

        assert_user_error(result, PolicyVaultError::InvalidValidUntil);
    }
}

#[test]
fn expire_now_sets_valid_until_to_now_and_emits_expired() {
    let env = odra_test::env();
    let mut vault = deploy_vault(&env);

    env.advance_block_time(250);

    vault.expire_now();

    assert_eq!(vault.get_valid_until_ms(), env.block_time_millis());
    assert!(env.emitted_event(&vault, &Expired {}));
}
