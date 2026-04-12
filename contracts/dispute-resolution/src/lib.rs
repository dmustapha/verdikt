#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, panic_with_error, symbol_short};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NotFound = 4,
}

const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND: u32 = 535_680;
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_EXTEND: u32 = 3_110_400;

// Import TrustLedger client (generated from trust-ledger contract)
// At build time, this is available via the trust_ledger contract's public interface.
// We define the client trait inline for simplicity.
mod trust_ledger {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/verdikt_trust_ledger.wasm"
    );
}

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum Verdict {
    Valid,
    Partial,
    Guilty,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    TrustLedgerId,
    NextId,
    Dispute(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct DisputeData {
    pub evidence_id: u64,
    pub seller: Address,
    pub checks_passed: u32,
    pub checks_total: u32,
    pub verdict: Verdict,
    pub timestamp: u64,
}

#[contract]
pub struct DisputeResolution;

#[contractimpl]
impl DisputeResolution {
    pub fn init(env: Env, admin: Address, trust_ledger_id: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::TrustLedgerId, &trust_ledger_id);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn record_verdict(
        env: Env,
        arbiter: Address,
        evidence_id: u64,
        seller: Address,
        checks_passed: u32,
        checks_total: u32,
        verdict: Verdict,
    ) -> u64 {
        arbiter.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if arbiter != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        let timestamp = env.ledger().timestamp();

        env.storage().persistent().set(
            &DataKey::Dispute(id),
            &DisputeData {
                evidence_id,
                seller: seller.clone(),
                checks_passed,
                checks_total,
                verdict: verdict.clone(),
                timestamp,
            },
        );
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        // Cross-contract call to Trust Ledger
        let trust_ledger_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::TrustLedgerId)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        let trust_client = trust_ledger::Client::new(&env, &trust_ledger_id);

        let trust_verdict = match verdict {
            Verdict::Valid => trust_ledger::Verdict::Valid,
            Verdict::Partial => trust_ledger::Verdict::Partial,
            Verdict::Guilty => trust_ledger::Verdict::Guilty,
        };

        trust_client.update_trust(&arbiter, &seller, &trust_verdict);

        // Extend TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        env.storage().persistent().extend_ttl(&DataKey::Dispute(id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);

        // Emit event
        env.events().publish((symbol_short!("verdict"),), id);

        id
    }

    pub fn get_dispute(env: Env, dispute_id: u64) -> DisputeData {
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound))
    }

    pub fn get_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}
