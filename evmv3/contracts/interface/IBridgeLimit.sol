// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBridgeLimit {
    // Which of a token's three buckets a flow is accounted against. The bridge
    // decides which kind applies (it's the only one that knows fromChain/
    // toChain/messageType); BridgeLimit just accounts by (token, kind).
    //
    // IMPORTANT for upgrades: only ever append new members at the end. The
    // numeric value of each member is the mapping key BridgeLimit stores
    // bucket state under - reordering or removing a member would silently
    // reinterpret already-configured bucket data as a different kind.
    enum BucketKind {
        Transit, // from another chain, through the relay, to another chain
        MapoOut, // originated on the relay chain itself (fromChain == self)
        MapoIn // value delivered on the relay chain (local recipient or deposit)
    }

    // Reverts if `kind`'s bucket for `token` does not have enough remaining
    // capacity, unless `initiator` is exempt.
    function consume(address token, BucketKind kind, uint256 amount, bytes calldata initiator) external;

    // Whether `executor` may be the target of relayExecute. Both the pre-swap
    // and post-swap legs of that hand-off are metered through the three
    // buckets above, but what the target contract does with the funds in
    // between is not, so the target itself must be pre-approved here.
    function isExecutorWhitelisted(address executor) external view returns (bool);
}
