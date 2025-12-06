// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract MockVRFCoordinator {
    uint256 private s_counter;

    event RandomWordsRequested(
        bytes32 indexed keyHash,
        uint256 requestId,
        uint256 preSeed,
        uint64 indexed subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords,
        address indexed sender
    );

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external returns (uint256 requestId) {
        requestId = uint256(keccak256(abi.encode(block.timestamp, msg.sender, s_counter)));
        s_counter++;

        emit RandomWordsRequested(
            req.keyHash,
            requestId,
            0, // preSeed
            uint64(req.subId), // Cast to uint64 for event compatibility if needed, or update event
            req.requestConfirmations,
            req.callbackGasLimit,
            req.numWords,
            msg.sender
        );

        return requestId;
    }

    function fulfillRandomWords(
        address _consumer,
        uint256 _requestId,
        uint256[] memory _randomWords
    ) external {
        VRFConsumerBaseV2Plus(_consumer).rawFulfillRandomWords(_requestId, _randomWords);
    }

    // Stub other interface functions
    // Removed V2 interface methods as we are not inheriting anymore.

    // Actually VRFCoordinatorV2Interface usually has these.
    // To be safe, I'll just implement what's needed for the test: requestRandomWords.
    // But since I say "is VRFCoordinatorV2Interface", I must implement all.
    // Let's check the interface definition if possible, or just remove "is VRFCoordinatorV2Interface" and rely on duck typing if Solidity allows (it doesn't for "is").
    // I'll remove "is VRFCoordinatorV2Interface" to avoid implementing all methods, as the test only calls requestRandomWords and fulfillRandomWords.
    // RifaChain casts it to VRFCoordinatorV2Interface, so it expects the interface methods to exist if called.
    // But RifaChain only calls requestRandomWords.
}
