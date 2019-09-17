pragma solidity ^0.5.10;

import './Killable.sol';

contract Ownable is Killable {
    address public owner;

    event LogTransferOwnership(address indexed owner, address indexed newOwner);

    constructor () internal {
        owner = msg.sender;
    }

    modifier onlyOwner()
    {
        require (msg.sender == owner, "This action may only be performed by the contract owner.");
        _;
    }

    function transferOwnership(address newOwner)
        public
        whenAlive
        onlyOwner
    {
        require (newOwner != address(0), 'New owner cannot be non-existent.');

        if (!isPauser(newOwner)){
            addPauser(newOwner);
        }

        emit LogTransferOwnership(owner, newOwner);
        owner = newOwner;
    }
}
