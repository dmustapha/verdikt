#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

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
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn update_trust(env: Env, caller: Address, agent: Address, verdict: Verdict) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(caller == admin, "only admin");

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

        data.total_tx += 1;

        match verdict {
            Verdict::Valid => {
                data.score += 10;
                data.successful += 1;
            }
            Verdict::Partial => {
                data.score -= 25;
                data.disputes_lost += 1;
            }
            Verdict::Guilty => {
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
            .set(&DataKey::Trust(agent), &data);
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
