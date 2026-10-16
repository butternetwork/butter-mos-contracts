// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessManagedUpgradeable} from "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {IBridgeLimit} from "./interface/IBridgeLimit.sol";

/// @title BridgeLimit
/// @notice Per-token, per-flow-type token-bucket rate limiting for
/// BridgeAndRelay. Every token has exactly three buckets, one per
/// `BucketKind` (Transit / MapoOut / MapoIn) - no per-destination-chain
/// dimension, so a flow is never checked against more than one bucket and
/// fan-out across many chains cannot dodge the cap (the cap is simply the
/// total value of that flow type, full stop). The bridge contract decides
/// which bucket a flow belongs to; this contract only accounts.
///
/// Also gates `relayExecute`'s target contract via `executorWhitelist`: both
/// the pre-swap and post-swap legs of that hand-off are metered through the
/// buckets above, but what the target contract does with the funds while it
/// holds them is not, so the target itself must be a pre-approved contract
/// known to actually hand the funds back to the bridge.
///
/// This contract holds no funds and is plugged into BridgeAndRelay via
/// `setServiceContract` (service slot 5) the same way `FeeService` and
/// `TokenRegisterV3` are, so limit tuning never requires upgrading the
/// bridge's own proxy. It is itself UUPS-upgradeable because it accumulates
/// live bucket state that would otherwise have to be re-entered by hand
/// after every logic fix.
contract BridgeLimit is Initializable, UUPSUpgradeable, AccessManagedUpgradeable, IBridgeLimit {
    error only_bridge();
    error limit_exceeded();
    error zero_address();
    error temporary_capacity_too_large();
    error temporary_duration_too_long();

    uint128 public constant MAX_TEMPORARY_MULTIPLIER = 2;
    uint64 public constant MAX_TEMPORARY_DURATION = 24 hours;

    struct Bucket {
        uint128 capacity; // permanent capacity, set via governance (setBucket)
        uint128 rate; // refill per second
        uint128 remaining; // tokens left as of lastRefill
        uint128 tempCapacity; // temporary capacity override; 0 = none active
        uint64 lastRefill;
        uint64 tempExpiry; // block.timestamp after which tempCapacity no longer applies
        bool enabled; // false = not enforced (unconfigured tokens pass through)
    }

    address public immutable bridge;

    // token => kind => bucket
    mapping(address => mapping(BucketKind => Bucket)) public buckets;

    // Contracts relayExecute is allowed to target - anything on this list is
    // trusted to hand the transferred funds back to the bridge rather than
    // keep them, so it never needs its own bucket.
    mapping(address => bool) public executorWhitelist;

    // Initiators exempt from every bucket, meant for the bridge's own
    // operational/treasury addresses, not end users - every exemption is an
    // unmonitored hole in the loss cap, so keep this list short and audited
    // via SetExempt. Keyed by raw initiator bytes (not `address`) because
    // initiators may be non-EVM identifiers - e.g. a 32-byte Solana pubkey or
    // a Tron address.
    mapping(bytes => bool) public exempt;

    event SetBucket(address indexed token, BucketKind indexed kind, uint128 capacity, uint128 rate, bool enabled);
    event SetTemporaryCapacity(address indexed token, BucketKind indexed kind, uint128 tempCapacity, uint64 expiry);
    event SetExecutorWhitelist(address indexed executor, bool allowed);
    event SetExempt(bytes account, bytes32 indexed accountHash, bool exempt);
    // Emitted on every successful (non-exempt, enabled-bucket) consume() call,
    // so off-chain monitoring can reconstruct flow volume per token/kind in
    // near real time instead of only discovering drains after the fact via
    // BridgeAndRelay's own MessageOut/MessageIn events.
    event Consumed(address indexed token, BucketKind indexed kind, uint256 amount, uint256 remaining, bytes initiator);

    modifier onlyBridge() {
        if (msg.sender != bridge) revert only_bridge();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _bridge) {
        if (_bridge == address(0)) revert zero_address();
        bridge = _bridge;
        _disableInitializers();
    }

    function initialize(address _authority) public initializer {
        __AccessManaged_init(_authority);
    }

    // --------------------------------------------- manage ----------------------------------------------

    // Permanent capacity/rate change. Bind this selector to a full-governance
    // role in AuthorityManager - unlike setTemporaryCapacity, there is no
    // on-chain cap on how much this can move a bucket.
    function setBucket(address _token, BucketKind _kind, uint128 _capacity, uint128 _rate, bool _enabled) external restricted {
        _setBucket(_token, _kind, _capacity, _rate, _enabled);
    }

    // One-transaction, atomic "stop everything for this token" brake: sets
    // all three buckets to enabled + capacity 0, so nothing moves in or out
    // for `_token` regardless of which flow type it comes through. Narrower
    // than pause() (which halts every token at once) - use this to contain a
    // single compromised/misbehaving token without taking down the rest of
    // the bridge for everyone else. Recommended to bind this selector to a
    // fast-response operational role, separate from the full-governance role
    // on setBucket, since during an incident speed matters more than the
    // deliberateness a permanent reconfiguration calls for.
    function emergencyFreezeToken(address _token) external restricted {
        _setBucket(_token, BucketKind.Transit, 0, 0, true);
        _setBucket(_token, BucketKind.MapoOut, 0, 0, true);
        _setBucket(_token, BucketKind.MapoIn, 0, 0, true);
    }

    // Short, capped emergency capacity bump: at most 2x the current permanent
    // capacity, for at most 24h, after which it lapses on its own (the next
    // _consume simply stops honoring it - no follow-up transaction needed).
    // Bind this selector to a narrower operational role than setBucket in
    // AuthorityManager; the hard caps below mean that role can only ever
    // cause a small, temporary loosening, not a permanent or unbounded one.
    function setTemporaryCapacity(address _token, BucketKind _kind, uint128 _tempCapacity, uint64 _duration) external restricted {
        Bucket storage b = buckets[_token][_kind];
        if (_tempCapacity > uint256(b.capacity) * MAX_TEMPORARY_MULTIPLIER) revert temporary_capacity_too_large();
        if (_duration > MAX_TEMPORARY_DURATION) revert temporary_duration_too_long();

        uint64 expiry = uint64(block.timestamp) + _duration;
        b.tempCapacity = _tempCapacity;
        b.tempExpiry = expiry;
        // Raising the ceiling should actually let more through immediately;
        // refill the gap the same way a fresh setBucket would, capped at the
        // (now higher) capacity.
        if (_tempCapacity > b.remaining) b.remaining = _tempCapacity;

        emit SetTemporaryCapacity(_token, _kind, _tempCapacity, expiry);
    }

    function setExecutorWhitelist(address _executor, bool _allowed) external restricted {
        executorWhitelist[_executor] = _allowed;
        emit SetExecutorWhitelist(_executor, _allowed);
    }

    function setExempt(bytes calldata _account, bool _exempt) external restricted {
        exempt[_account] = _exempt;
        emit SetExempt(_account, keccak256(_account), _exempt);
    }

    // --------------------------------------------- external view -------------------------------------------

    // Returns the subset of `_tokens` that have at least one of their three
    // buckets left disabled - i.e. currently unprotected for that flow type.
    // Intended for operational monitoring during the gradual per-token
    // rollout, not for on-chain use.
    function unconfigured(address[] calldata _tokens) external view returns (address[] memory tokens) {
        uint256 count;
        bool[] memory hit = new bool[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            if (
                !buckets[token][BucketKind.Transit].enabled ||
                !buckets[token][BucketKind.MapoOut].enabled ||
                !buckets[token][BucketKind.MapoIn].enabled
            ) {
                hit[i] = true;
                count++;
            }
        }

        tokens = new address[](count);
        uint256 j;
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (hit[i]) tokens[j++] = _tokens[i];
        }
    }

    function isExecutorWhitelisted(address _executor) external view override returns (bool) {
        return executorWhitelist[_executor];
    }

    // How much `kind`'s bucket for `token` would actually let through right
    // now, accounting for refill since the last consume - the same number
    // `consume` itself checks against, computed without mutating state.
    // Returns type(uint256).max for a bucket that isn't enabled (unlimited,
    // matching _consume's no-op behavior), so a pre-flight check never
    // blocks on an unconfigured bucket. Intended for front-ends/APIs to
    // check before a user initiates a transfer that could otherwise end up
    // stuck on the source chain if it would exceed the bucket.
    function available(address _token, BucketKind _kind) external view returns (uint256) {
        Bucket storage b = buckets[_token][_kind];
        if (!b.enabled) return type(uint256).max;

        uint256 cap = _effectiveCapacity(b);
        uint256 avail = uint256(b.remaining) + (block.timestamp - b.lastRefill) * uint256(b.rate);
        return avail > cap ? cap : avail;
    }

    function getImplementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    // --------------------------------------------- external ----------------------------------------------

    function consume(
        address _token,
        BucketKind _kind,
        uint256 _amount,
        bytes calldata _initiator
    ) external override onlyBridge {
        if (exempt[_initiator]) return;

        (bool consumed, uint256 remaining) = _consume(buckets[_token][_kind], _amount);
        // Skip the event for a disabled (unconfigured) bucket - _consume was
        // a no-op, so there's nothing meaningful to log, and every call
        // against an unconfigured token would otherwise spam this stream.
        if (consumed) emit Consumed(_token, _kind, _amount, remaining, _initiator);
    }

    // --------------------------------------------- internal ----------------------------------------------

    function _setBucket(address _token, BucketKind _kind, uint128 _capacity, uint128 _rate, bool _enabled) internal {
        Bucket storage b = buckets[_token][_kind];
        b.capacity = _capacity;
        b.rate = _rate;
        // Reset the fill level and refill checkpoint on every (re)configuration,
        // otherwise a stale `lastRefill` (zero for a never-before-set bucket)
        // would let the very first `_consume` compute a refill spanning from
        // the Unix epoch to now. This also immediately truncates `remaining`
        // when capacity is being lowered, as required.
        b.remaining = _capacity;
        b.lastRefill = uint64(block.timestamp);
        b.enabled = _enabled;
        // Any pending temporary override is superseded by a deliberate
        // permanent reconfiguration.
        b.tempCapacity = 0;
        b.tempExpiry = 0;
        emit SetBucket(_token, _kind, _capacity, _rate, _enabled);
    }

    function _effectiveCapacity(Bucket storage _b) internal view returns (uint256) {
        return block.timestamp < _b.tempExpiry ? _b.tempCapacity : _b.capacity;
    }

    function _consume(Bucket storage _b, uint256 _amount) internal returns (bool consumed, uint256 remaining) {
        if (!_b.enabled) return (false, 0);

        uint256 cap = _effectiveCapacity(_b);
        uint256 avail = uint256(_b.remaining) + (block.timestamp - _b.lastRefill) * uint256(_b.rate);
        if (avail > cap) avail = cap;
        if (avail < _amount) revert limit_exceeded();

        remaining = avail - _amount;
        _b.remaining = uint128(remaining);
        _b.lastRefill = uint64(block.timestamp);
        consumed = true;
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal override restricted {}

    // Reserved storage for future upgrades - lets new state variables be
    // appended without needing a storage-layout migration.
    uint256[45] private __gap;
}
