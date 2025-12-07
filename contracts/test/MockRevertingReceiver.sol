// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockRevertingReceiver {
    function joinRaffle(address _target, uint256 _raffleId, uint256 _ticketCount) external payable {
        (bool success, ) = _target.call{value: msg.value}(
            abi.encodeWithSignature("joinRaffle(uint256,uint256,bytes)", _raffleId, _ticketCount, "")
        );
        require(success, "Join failed");
    }

    function withdrawRefund(address _target, uint256 _raffleId) external {
        (bool success, ) = _target.call(
            abi.encodeWithSignature("withdrawRefund(uint256)", _raffleId)
        );
        require(success, "Withdraw call failed");
    }

    function createRaffle(
        address _target,
        string memory _title,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _minParticipants,
        uint256 _maxParticipants,
        uint256 _ticketPrice,
        uint256 _fundingAmount,
        uint8 _tokenType,
        address _tokenAddress
    ) external payable {
        // Minimal params for testing
        uint256[] memory percentages = new uint256[](1);
        percentages[0] = 100;
        
        (bool success, ) = _target.call{value: msg.value}(
            abi.encodeWithSignature(
                "createRaffle(string,string,uint256,uint256,uint256,uint256,bool,uint8,address,uint256,address,bool,uint256,uint256[])",
                _title, "Desc", _startTime, _endTime, _minParticipants, _maxParticipants, true, _tokenType, _tokenAddress, _ticketPrice, address(this), true, _fundingAmount, percentages
            )
        );
        require(success, "Create failed");
    }

    function cancelRaffle(address _target, uint256 _raffleId) external {
        (bool success, ) = _target.call(
            abi.encodeWithSignature("cancelRaffle(uint256)", _raffleId)
        );
        require(success, "Cancel failed");
    }

    function claimPrize(address _target, uint256 _raffleId) external {
        (bool success, ) = _target.call(
            abi.encodeWithSignature("claimPrize(uint256)", _raffleId)
        );
        require(success, "Claim failed");
    }

    function withdrawCreatorEarnings(address _target, uint256 _raffleId) external {
        (bool success, ) = _target.call(
            abi.encodeWithSignature("withdrawCreatorEarnings(uint256)", _raffleId)
        );
        require(success, "Withdraw earnings failed");
    }

    receive() external payable {
        revert("I reject payments");
    }
}
