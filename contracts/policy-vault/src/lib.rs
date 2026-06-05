#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

use odra::prelude::*;

pub mod errors;

#[odra::module]
pub struct PolicyVault;

#[odra::module]
impl PolicyVault {
    pub fn init(&mut self) {}
}
