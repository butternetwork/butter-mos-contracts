#!/bin/bash

npx hardhat compile
if [ "$1" == "BscTest" ]; then
  rm -r deployments/BscTest
  npx hardhat mosDeploy --wrapped 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd --lightnode 0xdB913e87608e3d91C6F0b52E97a6760E7661B8f6 --network BscTest
elif [ "$1" == "MaticTest" ]; then
  rm -r deployments/MaticTest
  npx hardhat mosDeploy --wrapped 0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889 --lightnode 0x05634BdfbDa8aC4653Ff0655d71719F61A0922C4 --network MaticTest && npx hardhat swapIn --network MaticTest
fi