pragma solidity ^0.5.10;

import './Killable.sol';

contract Ownable {

    address private owner;
    event LogTransferOwnership(address indexed owner, address indexed newOwner);

    constructor () internal {
        owner = msg.sender;
    }

    function getOwner()
        public
        view
        returns (address)
    {
        return owner;
    }

    modifier onlyOwner()
    {
        require (msg.sender == owner, "This action may only be performed by the contract owner.");
        _;
    }

    function transferOwnership(address newOwner)
        public
        onlyOwner
    {
        require (newOwner != address(0), 'New owner cannot be non-existent.');

        emit LogTransferOwnership(owner, newOwner);
        owner = newOwner;
    }
}
