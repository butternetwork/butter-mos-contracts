use crate::management::ChainType::{EvmChain, Unknown};
use crate::*;

const GAS_FOR_UPGRADE_SELF_DEPLOY: Gas = Gas(15_000_000_000_000);

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub enum ChainType {
    EvmChain,
    Unknown,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct MAPOServiceV1_1 {
    /// The account of the map light client that we can use to prove
    pub map_client_account: AccountId,
    /// Address of the MAP bridge contract.
    pub map_bridge_address: Address,
    /// Set of created MCSToken contracts.
    pub mcs_tokens: UnorderedMap<AccountId, HashSet<u128>>,
    /// Set of other fungible token contracts.
    pub fungible_tokens: UnorderedMap<AccountId, HashSet<u128>>,
    /// Map of other fungible token contracts and their min storage balance.
    pub fungible_tokens_storage_balance: UnorderedMap<AccountId, u128>,
    /// Map of token contracts and their decimals
    pub token_decimals: UnorderedMap<AccountId, u8>,
    /// Set of other fungible token contracts.
    pub native_to_chains: HashSet<u128>,
    /// Map of chain id and chain type
    pub chain_id_type_map: UnorderedMap<u128, ChainType>,
    /// Hashes of the events that were already used.
    pub used_events: UnorderedSet<CryptoHash>,
    /// Account of the owner
    pub owner: AccountId,
    /// Balance required to register a new account in the MCSToken
    pub mcs_storage_balance_min: Balance,
    // Wrap token for near
    pub wrapped_token: AccountId,
    // Near chain id
    pub near_chain_id: u128,
    // MAP chain id
    pub map_chain_id: u128,
    // Nonce to generate order id
    pub nonce: u128,
    /// Mask determining all paused functions
    pub paused: Mask,

    pub registered_tokens: UnorderedMap<AccountId, bool>,

    /// SWAP related
    pub ref_exchange: AccountId,
    pub core_idle: Vec<AccountId>,
    pub core_total: Vec<AccountId>,
    pub amount_out: HashMap<AccountId, U128>,
    pub lost_found: UnorderedMap<AccountId, HashMap<AccountId, Balance>>,
}

#[near_bindgen]
impl MAPOServiceV2 {
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mos: MAPOServiceV2 = env::state_read().expect("ERR_CONTRACT_IS_NOT_INITIALIZED");
        mos
    }
    pub fn set_chain_type(&mut self, chain_id: U128, chain_type: ChainType) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );

        self.chain_id_type_map.insert(&chain_id.into(), &chain_type);
    }

    pub fn get_chain_type(&self, chain_id: U128) -> ChainType {
        let chain_id = chain_id.into();
        if chain_id == self.map_chain_id {
            return EvmChain;
        }
        let option = self.chain_id_type_map.get(&chain_id);
        if let Some(chain_type) = option {
            chain_type
        } else {
            Unknown
        }
    }

    pub fn set_owner(&mut self, new_owner: AccountId) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        self.owner = new_owner;
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn set_map_light_client(&mut self, map_client_account: AccountId) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        assert!(
            self.is_paused(PAUSE_TRANSFER_IN),
            "transfer in should be paused when setting map light client account"
        );

        self.map_client_account = map_client_account;
    }

    pub fn get_map_light_client(&self) -> AccountId {
        self.map_client_account.clone()
    }

    pub fn set_near_chain_id(&mut self, near_chain_id: U128) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        assert!(
            self.is_paused(PAUSE_TRANSFER_OUT_TOKEN)
                && self.is_paused(PAUSE_TRANSFER_OUT_NATIVE)
                && self.is_paused(PAUSE_DEPOSIT_OUT_TOKEN)
                && self.is_paused(PAUSE_DEPOSIT_OUT_NATIVE),
            "transfer/deposit out should be paused when setting near chain id"
        );

        self.near_chain_id = near_chain_id.into();
    }

    pub fn get_near_chain_id(&self) -> U128 {
        self.near_chain_id.into()
    }

    pub fn set_map_chain_id(&mut self, map_chain_id: U128) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        assert!(
            self.is_paused(PAUSE_DEPOSIT_OUT_TOKEN) && self.is_paused(PAUSE_DEPOSIT_OUT_NATIVE),
            "deposit out should be paused when setting map chain id"
        );

        self.map_chain_id = map_chain_id.into();
    }

    pub fn get_map_chain_id(&self) -> U128 {
        self.map_chain_id.into()
    }

    pub fn set_map_relay_address(&mut self, map_relay_address: String) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        assert!(
            self.is_paused(PAUSE_TRANSFER_IN),
            "transfer in should be paused when setting near chain id"
        );

        self.map_bridge_address = validate_eth_address(map_relay_address);
    }

    pub fn get_map_relay_address(&self) -> String {
        hex::encode(self.map_bridge_address)
    }

    pub fn upgrade_self(&mut self, code: Base64VecU8) {
        assert!(
            self.is_owner(),
            "unexpected caller {}",
            env::predecessor_account_id()
        );
        assert!(
            self.is_paused(PAUSE_DEPLOY_TOKEN)
                && self.is_paused(PAUSE_TRANSFER_IN)
                && self.is_paused(PAUSE_TRANSFER_OUT_TOKEN)
                && self.is_paused(PAUSE_TRANSFER_OUT_NATIVE)
                && self.is_paused(PAUSE_DEPOSIT_OUT_TOKEN)
                && self.is_paused(PAUSE_DEPOSIT_OUT_NATIVE),
            "everything should be paused when upgrading mcs contract"
        );

        let current_id = env::current_account_id();
        let promise_id = env::promise_batch_create(&current_id);
        env::promise_batch_action_deploy_contract(promise_id, &code.0);
        env::promise_batch_action_function_call(
            promise_id,
            "migrate",
            &[],
            NO_DEPOSIT,
            env::prepaid_gas() - env::used_gas() - GAS_FOR_UPGRADE_SELF_DEPLOY,
        );
    }
}
