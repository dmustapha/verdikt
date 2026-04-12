#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, panic_with_error, symbol_short};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
}

const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND: u32 = 535_680;
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_EXTEND: u32 = 3_110_400;

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum Verdict {
    Valid,
    Partial,
    Guilty,
}

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum TrustTier {
    Untrusted,
    Standard,
    Trusted,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Trust(Address),
}

#[derive(Clone)]
#[contracttype]
pub struct TrustData {
    pub score: i64,
    pub total_tx: u64,
    pub successful: u64,
    pub disputes_lost: u64,
    pub tier: TrustTier,
}

#[contract]
pub struct TrustLedger;

fn compute_tier(score: i64) -> TrustTier {
    if score >= 700 {
        TrustTier::Trusted
    } else if score >= 300 {
        TrustTier::Standard
    } else {
        TrustTier::Untrusted
    }
}

#[contractimpl]
impl TrustLedger {
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn update_trust(env: Env, caller: Address, agent: Address, verdict: Verdict) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        if caller != admin {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let mut data: TrustData = env
            .storage()
            .persistent()
            .get(&DataKey::Trust(agent.clone()))
            .unwrap_or(TrustData {
                score: 0,
                total_tx: 0,
                successful: 0,
                disputes_lost: 0,
                tier: TrustTier::Untrusted,
            });

        match verdict {
            Verdict::Valid => {
                data.total_tx += 1;
                data.score += 10;
                data.successful += 1;
            }
            Verdict::Partial => {
                // Trust-neutral: ambiguous delivery doesn't count toward total_tx or successful
            }
            Verdict::Guilty => {
                data.total_tx += 1;
                data.score -= 50;
                data.disputes_lost += 1;
            }
        }

        // Score floor at 0
        if data.score < 0 {
            data.score = 0;
        }

        data.tier = compute_tier(data.score);

        env.storage()
            .persistent()
            .set(&DataKey::Trust(agent.clone()), &data);

        // Extend TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        env.storage().persistent().extend_ttl(&DataKey::Trust(agent), PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);

        // Emit event
        env.events().publish((symbol_short!("trust"),), data.score);
    }

    pub fn get_trust(env: Env, agent: Address) -> TrustData {
        env.storage()
            .persistent()
            .get(&DataKey::Trust(agent))
            .unwrap_or(TrustData {
                score: 0,
                total_tx: 0,
                successful: 0,
                disputes_lost: 0,
                tier: TrustTier::Untrusted,
            })
    }

    pub fn get_tier(env: Env, agent: Address) -> TrustTier {
        let data = Self::get_trust(env, agent);
        data.tier
    }
}
