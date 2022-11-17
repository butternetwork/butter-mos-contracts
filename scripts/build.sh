#!/usr/bin/env bash
cd ../evm
npx hardhat compile

cd ../near
cargo build
./scripts/build.sh