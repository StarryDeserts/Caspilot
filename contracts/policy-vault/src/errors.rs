use odra::prelude::OdraError;

#[odra::odra_error]
pub enum PolicyVaultError {
    NotOwner = 1,
    AgentNotAllowed = 2,
    ReceiverNotAllowed = 3,
    AmountAboveMax = 4,
    DayLimitExceeded = 5,
    VaultExpired = 6,
    NonceAlreadyUsed = 7,
    InsufficientVaultBalance = 8,
    ArithmeticOverflow = 9,
    InvalidValidUntil = 10,
    Cep18CallFailed = 11,
}
