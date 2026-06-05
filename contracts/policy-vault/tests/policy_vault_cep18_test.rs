use odra::casper_types::U256;
use odra::host::{Deployer, HostRef};
use odra::prelude::*;
use odra_modules::cep18::utils::Cep18Modality;
use odra_modules::cep18_token::{Cep18, Cep18HostRef, Cep18InitArgs};
use policy_vault::errors::PolicyVaultError;
use policy_vault::events::Paid;
use policy_vault::{PolicyVault, PolicyVaultInitArgs};

const DAY_MS: u64 = 86_400_000;
const FUTURE_MS: u64 = DAY_MS * 10;

fn u256(value: u64) -> U256 {
    U256::from(value)
}

fn address_of<T: HostRef>(contract: &T) -> Address {
    *contract.address()
}

fn deploy_token(env: &odra::host::HostEnv, initial_supply: U256) -> Cep18HostRef {
    Cep18::deploy(
        env,
        Cep18InitArgs {
            symbol: "CAS".to_string(),
            name: "Caspilot Token".to_string(),
            decimals: 6,
            initial_supply,
            admin_list: vec![],
            minter_list: vec![],
            modality: Some(Cep18Modality::None),
        },
    )
}

fn deploy_vault_with_token(
    env: &odra::host::HostEnv,
    token_address: Address,
) -> policy_vault::PolicyVaultHostRef {
    PolicyVault::deploy(
        env,
        PolicyVaultInitArgs {
            token_package: token_address,
            max_single: u256(100),
            daily_limit: u256(1_000),
            valid_until_ms: FUTURE_MS,
        },
    )
}

fn configure_vault(
    vault: &mut policy_vault::PolicyVaultHostRef,
    env: &odra::host::HostEnv,
) -> (Address, Address) {
    let agent = env.get_account(2);
    let receiver = env.get_account(3);
    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    (agent, receiver)
}

fn assert_user_error<T>(result: OdraResult<T>, expected: PolicyVaultError) {
    let Some(error) = result.err() else {
        panic!("expected PolicyVaultError code {}", expected as u16);
    };

    assert_eq!(error.code(), expected as u16);
}

#[test]
fn vault_can_hold_selected_cep18_token() {
    let env = odra_test::env();
    let mut token = deploy_token(&env, u256(1_000));
    let vault = deploy_vault_with_token(&env, address_of(&token));
    let funded_amount = u256(250);

    token.transfer(vault.address(), &funded_amount);

    assert_eq!(token.balance_of(vault.address()), funded_amount);
}

#[test]
fn pay_transfers_cep18_from_vault_to_receiver_and_commits_state() {
    let env = odra_test::env();
    let mut token = deploy_token(&env, u256(1_000));
    let mut vault = deploy_vault_with_token(&env, address_of(&token));
    let (agent, receiver) = configure_vault(&mut vault, &env);
    let funded_amount = u256(250);
    let amount = u256(42);
    let payload_hash = [41u8; 32];
    let expected_day = env.block_time_millis() / DAY_MS;

    token.transfer(vault.address(), &funded_amount);
    let receiver_before = token.balance_of(&receiver);

    env.set_caller(agent);
    vault.pay(receiver, amount, payload_hash);

    assert_eq!(token.balance_of(&receiver), receiver_before + amount);
    assert_eq!(token.balance_of(vault.address()), funded_amount - amount);
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
fn pay_reverts_insufficient_vault_balance_before_transfer_and_leaves_state_unchanged() {
    let env = odra_test::env();
    let mut token = deploy_token(&env, u256(1_000));
    let mut vault = deploy_vault_with_token(&env, address_of(&token));
    let (agent, receiver) = configure_vault(&mut vault, &env);
    let funded_amount = u256(10);
    let amount = u256(42);
    let payload_hash = [42u8; 32];

    token.transfer(vault.address(), &funded_amount);
    let receiver_before = token.balance_of(&receiver);

    env.set_caller(agent);

    assert_user_error(
        vault.try_pay(receiver, amount, payload_hash),
        PolicyVaultError::InsufficientVaultBalance,
    );
    assert_eq!(token.balance_of(&receiver), receiver_before);
    assert_eq!(token.balance_of(vault.address()), funded_amount);
    assert!(!vault.is_payload_used(payload_hash));
    assert_eq!(vault.get_day_state(), (0, U256::zero(), U256::zero()));
}

#[test]
fn transfer_failure_propagates_callee_error_and_leaves_state_unchanged() {
    let env = odra_test::env();
    let mut token = deploy_token(&env, u256(1_000));
    let mut vault = deploy_vault_with_token(&env, address_of(&token));
    let agent = env.get_account(2);
    let receiver = address_of(&vault);
    let amount = u256(42);
    let payload_hash = [43u8; 32];

    vault.allow_agent(agent);
    vault.allow_receiver(receiver);
    token.transfer(vault.address(), &u256(100));
    env.set_caller(agent);

    let error = vault
        .try_pay(receiver, amount, payload_hash)
        .expect_err("expected external CEP-18 transfer failure");
    assert_eq!(error.code(), 60_017);
    assert!(!vault.is_payload_used(payload_hash));
    assert_eq!(vault.get_day_state(), (0, U256::zero(), U256::zero()));
    assert_eq!(token.balance_of(vault.address()), u256(100));
}
