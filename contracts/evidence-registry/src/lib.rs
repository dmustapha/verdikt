#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, panic_with_error, symbol_short};

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

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NextId,
    Evidence(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct EvidenceData {
    pub tx_hash: BytesN<32>,
    pub request_hash: BytesN<32>,
    pub response_hash: BytesN<32>,
    pub buyer: Address,
    pub seller: Address,
    pub timestamp: u64,
}

#[contract]
pub struct EvidenceRegistry;

#[contractimpl]
impl EvidenceRegistry {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn store_evidence(
        env: Env,
        caller: Address,
        tx_hash: BytesN<32>,
        request_hash: BytesN<32>,
        response_hash: BytesN<32>,
        buyer: Address,
        seller: Address,
    ) -> u64 {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        let timestamp = env.ledger().timestamp();

        env.storage().persistent().set(
            &DataKey::Evidence(id),
            &EvidenceData {
                tx_hash,
                request_hash,
                response_hash,
                buyer,
                seller,
                timestamp,
            },
        );
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        // Extend TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        env.storage().persistent().extend_ttl(&DataKey::Evidence(id), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);

        // Emit event
        env.events().publish((symbol_short!("evidence"),), id);

        id
    }

    pub fn get_evidence(env: Env, evidence_id: u64) -> EvidenceData {
        env.storage()
            .persistent()
            .get(&DataKey::Evidence(evidence_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotFound))
    }

    pub fn get_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}
