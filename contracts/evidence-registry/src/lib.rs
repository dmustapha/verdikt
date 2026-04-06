#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

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
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &0u64);
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
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(caller == admin, "only admin");

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
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
        id
    }

    pub fn get_evidence(env: Env, evidence_id: u64) -> EvidenceData {
        env.storage()
            .persistent()
            .get(&DataKey::Evidence(evidence_id))
            .unwrap()
    }

    pub fn get_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}
