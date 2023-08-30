use crate::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
#[serde(tag = "type")]
pub enum TokenReceiverMessage {
    Deposit {
        #[serde(with = "crate::bytes::hexstring")]
        to: Vec<u8>,
    },
    Swap {
        #[serde(with = "crate::bytes::hexstring")]
        to: Vec<u8>,
        to_chain: U128,
        swap_info: SwapInfo,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct SwapInfo {
    pub entrance: String,
    pub src_swap: Vec<SwapParam>,
    #[serde(with = "crate::bytes::hexstring")]
    pub dst_swap: Vec<u8>,
}

#[near_bindgen]
impl FungibleTokenReceiver for MAPOServiceV2 {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        if msg.is_empty() {
            log!(
                "mos receiver {} token {} from core {}",
                amount.0,
                token,
                sender_id
            );
            self.amount_out.insert(sender_id, amount);
            return PromiseOrValue::Value(U128(0));
        }

        let token_receiver_msg: TokenReceiverMessage = serde_json::from_str(&msg).unwrap();
        match token_receiver_msg {
            TokenReceiverMessage::Deposit { to } => {
                self.check_not_paused(PAUSE_DEPOSIT_OUT_TOKEN);
                assert!(
                    self.valid_fungible_token_out(&token, self.map_chain_id.into()),
                    "deposit token {} to chain {} is not supported",
                    token,
                    self.map_chain_id
                );
                self.check_to_account(to.clone(), self.map_chain_id);
                self.check_amount(&token, amount.0);

                let order_id = self.get_order_id(&sender_id.to_string(), &to, self.map_chain_id);
                DepositOutEvent {
                    from: sender_id.to_string(),
                    to,
                    order_id,
                    from_chain: self.near_chain_id.into(),
                    to_chain: self.map_chain_id.into(),
                    token: token.to_string(),
                    amount,
                }
                .emit();

                PromiseOrValue::Value(U128(0))
            }
            TokenReceiverMessage::Swap {
                to,
                to_chain,
                swap_info,
            } => {
                let token = env::predecessor_account_id();
                let swap_fee_info = self.build_swap_fee_info( amount, &swap_info);
                let swap_amount = U128::from(amount.0 - swap_fee_info.fee_amount.0);

                self.process_token_swap_out(
                    to_chain,
                    token.clone(),
                    token,
                    sender_id,
                    to,
                    swap_amount,
                    swap_info,
                    swap_fee_info
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethabi::Token;
    use hex;
    use near_sdk::json_types::U64;
    use near_sdk::AccountId;
    use std::str::FromStr;
    use std::string::String;
    use tiny_keccak::keccak256;

    #[test]
    fn test_swap_info_json() {
        let swap_param = SwapParam {
            amount_in: U128(1000),
            min_amount_out: U128(1),
            path: "token1.map007.testnetXtoken2.map007.testnet"
                .as_bytes()
                .to_vec(),
            router_index: U64(1),
        };
        let swap_info = SwapInfo {
            entrance: "".to_string(),
            src_swap: vec![swap_param],
            dst_swap: vec![0;100],
        };

        println!("{}", serde_json::to_string(&swap_info).unwrap())
    }

    #[test]
    fn test_msg_json() {
        let swap_param0 = SwapParam {
            amount_in: U128(1000),
            min_amount_out: U128(1),
            path: "token1.map007.testnetXtoken2.map007.testnet"
                .as_bytes()
                .to_vec(),
            router_index: U64(0),
        };
        let swap_param1 = SwapParam {
            amount_in: U128(1000),
            min_amount_out: U128(1),
            path: hex::decode(
                "B6c1b689291532D11172Fb4C204bf13169EC0dCAB6c1b689291532D11172Fb4C204bf13169EC0dCB",
            )
            .unwrap(),
            router_index: U64(1),
        };
        let swap_info = SwapInfo {
            entrance: "".to_string(),
            src_swap: vec![swap_param0],
            dst_swap: vec![0;100],
        };

        let tr_msg = TokenReceiverMessage::Swap {
            to: vec![2; 20],
            to_chain: U128(212),
            swap_info,
        };

        let msg = serde_json::to_string(&tr_msg).unwrap();

        println!("{}", msg);
        println!("{}", hex::encode(env::sha256("Butter+".as_bytes())));
        println!("{}", hex::encode(env::sha256("TrustWallet".as_bytes())));

        let token_receiver_msg: TokenReceiverMessage = serde_json::from_str(&msg).unwrap();
        match token_receiver_msg {
            TokenReceiverMessage::Deposit { .. } => {
                println!("Deposit")
            }
            TokenReceiverMessage::Swap { .. } => {
                println!("Swap")
            }
            TokenReceiverMessage::LostFound { .. } => {
                println!("LostFound")
            }
        }
    }
}
