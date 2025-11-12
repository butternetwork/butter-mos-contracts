// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { AccessManagedUpgradeable } from "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";

abstract contract BaseImplementation is
    UUPSUpgradeable,
    PausableUpgradeable,
    AccessManagedUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __BaseImplementation_init(address _defaultAdmin) internal onlyInitializing {
        __Pausable_init();
        __AccessManaged_init(_defaultAdmin);
        __UUPSUpgradeable_init();
    }

    function __BaseImplementation_init_unchained(address _defaultAdmin) internal onlyInitializing {
        // Reserved for future use
    }

    function trigger() external restricted {
        paused() ? _unpause() : _pause();
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override restricted { }

    function getImplementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }
}
