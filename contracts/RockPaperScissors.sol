pragma solidity 0.5.10;

import './Ownable.sol';

contract RockPaperScissors is Ownable, Killable {

    enum Action
    {
        Null, Rock, Paper, Scissors
    }

    enum Status
    {
        NotInPlay, WaitingForJoin, WaitingForPlay, WaitingForUnlock, Complete
    }

    struct Game
    {
        address player1Sender;
        Action player2Move;
        address player2Sender;
        uint256 bet;
        uint256 gameDeadline;
    }

    mapping (address => uint256) balances;
    mapping (bytes32 => Game) public games;

    uint256 public constant joinPeriod = 1 hours;
    uint256 public constant playPeriod = 1 hours;
    uint256 public constant unlockPeriod = 2 hours;

    event LogWithdraw(address indexed sender, uint256 amount);
    event LogEnrol(bytes32 indexed entryHash, address indexed sender, uint256 indexed bet);
    event LogJoin(bytes32 indexed entryHash, address indexed sender);
    event LogPlay(bytes32 indexed entryHash, address indexed sender, Action indexed move);
    event LogUnlock(bytes32 indexed entryHash, address indexed sender, Action indexed move);
    event LogWinnerFound(bytes32 indexed entryHash, address indexed winner, address indexed loser, uint256 amount);
    event LogDrawGame(bytes32 indexed entryHash, address indexed player1, address indexed player2, uint256 amount);
    event LogCancelNoJoin(bytes32 indexed entryHash, address indexed sender);
    event LogCancelNoPlay(bytes32 indexed entryHash, address indexed sender);
    event LogCancelNoUnlock(bytes32 indexed entryHash, address indexed sender);
    event LogKilledWithdrawal(address indexed sender, uint256 amount);


    using SafeMath for uint256;

    constructor() public {}

    /* Game statuses:

                       | player1Sender | player2Move | player2Sender | deadline
    ============================================================================
    0 NotInPlay        |     0         |     0       |     0         |     0
    1 WaitingForJoin   |   not 0       |     0       |     0         |   not 0
    2 WatiingForPlay   |   not 0       |     0       |   not 0       |   not 0
    3 WaitingForUnlock |   not 0       |   not 0     |   not 0       |   not 0
    4 Complete         |   not 0       |   not 0     |     0         |     0
     */

    function getStatus(bytes32 entryHash)
        public
        view
        whenAlive
        returns (Status)
    {
        Action player2Move = games[entryHash].player2Move;

        if (games[entryHash].player2Sender != address(0)) {
            if (player2Move == Action.Null) return Status.WaitingForPlay;
            else return Status.WaitingForUnlock;
        } else if (games[entryHash].player1Sender != address(0)) {
            if (player2Move == Action.Null) return Status.WaitingForJoin;
            else return Status.Complete;
        } else {
            return Status.NotInPlay;
        }
    }

    // The below function does the same thing as 'getStatus' plus verifies player1Sender, re-written to optimize gas savings.
    function getStatusWithPlayer1Restriction(bytes32 entryHash)
        internal
        view
        whenAlive
        returns (Status)
    {
        require(games[entryHash].player1Sender == msg.sender, 'Only player 1 allowed to call this function.');
        require(msg.sender != address(0), 'Address 0 not allowed.');

        Action player2Move = games[entryHash].player2Move;

        if (games[entryHash].player2Sender != address(0)) {
            if (player2Move == Action.Null) return Status.WaitingForPlay;
            else return Status.WaitingForUnlock;
        } else {
            if (player2Move == Action.Null) return Status.WaitingForJoin;
            else return Status.Complete;
        }
    }

    // The below function does the same thing as 'getStatus' plus verifies player2Sender, re-written to optimize gas savings.
    function getStatusWithPlayer2Restriction(bytes32 entryHash)
        internal
        view
        whenAlive
        returns (Status)
    {
        require(games[entryHash].player2Sender == msg.sender, 'Only player 2 allowed to call this function.');
        require(msg.sender != address(0), 'Address 0 not allowed.');

        return games[entryHash].player2Move == Action.Null ? Status.WaitingForPlay : Status.WaitingForUnlock;
    }

    function getBalance()
        public
        view
        whenAlive
        returns (uint256)
    {
        return balances[msg.sender];
    }

    function withdraw(uint256 withdrawAmount)
        public
        whenNotPaused
        whenAlive
    {
        require(withdrawAmount > 0, "Nothing to withdraw");
        balances[msg.sender] = balances[msg.sender].sub(withdrawAmount);
        emit LogWithdraw(msg.sender, withdrawAmount);
        msg.sender.transfer(withdrawAmount);
    }

    function getCurrentBet(bytes32 entryHash)
        public
        view
        whenNotPaused
        whenAlive
        returns (uint256)
    {
        require(games[entryHash].player1Sender != address(0), 'No current player.');
        return games[entryHash].bet;
    }

    function enrol(bytes32 entryHash, uint256 newBet)
        public
        payable
        whenNotPaused
        whenAlive
        returns (uint256)
    {
        require(getStatus(entryHash) == Status.NotInPlay, 'Game already in progress or entryHash used before.');

        /* The null condition for players 1 and 2 in this contract is address(0).
        In other words,address(0) is taken to be the case where there is no player.
        As such, address(0) is not allowed to be a player in this contract. */
        require(msg.sender != address(0), 'Address 0 not allowed.');

        balances[msg.sender] = balances[msg.sender].add(msg.value).sub(newBet);
        games[entryHash].bet = newBet;
        games[entryHash].player1Sender = msg.sender;
        games[entryHash].gameDeadline = now.add(playPeriod);

        emit LogEnrol(entryHash, msg.sender, newBet);
    }

    function join(bytes32 entryHash)
        public
        payable
        whenNotPaused
        whenAlive
    {
        require(getStatus(entryHash) == Status.WaitingForJoin, 'Not expecting player 2 to join.');
        require(msg.sender != address(0), 'Address 0 not allowed.');

        balances[msg.sender] = balances[msg.sender].add(msg.value).sub(games[entryHash].bet);
        games[entryHash].player2Sender = msg.sender;
        games[entryHash].gameDeadline = now.add(playPeriod);

        emit LogJoin(entryHash, msg.sender);
    }

    function play(bytes32 entryHash, Action move)
        public
        whenNotPaused
        whenAlive
    {
        require(getStatusWithPlayer2Restriction(entryHash) == Status.WaitingForPlay, 'Not expecting player 2 to play.');
        require(move != Action.Null, 'Ineligible move.');

        games[entryHash].player2Move = move;
        games[entryHash].gameDeadline = now.add(unlockPeriod);

        emit LogPlay(entryHash, msg.sender, move);
    }

    function unlock(bytes32 entryHash, bytes32 code, Action move)
        public
        whenNotPaused
        whenAlive
    {
        require(getStatusWithPlayer1Restriction(entryHash) == Status.WaitingForUnlock, 'Not expecting player 1 to unlock.');
        require(move != Action.Null, 'Ineligible move.');
        require(hashIt(code, move) == entryHash, 'Unverified move.');

        emit LogUnlock(entryHash, msg.sender, move);
        evaluate(entryHash, move);
    }

    function evaluate(bytes32 entryHash, Action p1Move)
        internal
        whenNotPaused
        whenAlive
    {
        uint256 betSize = games[entryHash].bet;
        address p1Sender = games[entryHash].player1Sender;
        address p2Sender = games[entryHash].player2Sender;

        uint8 result = (3 + uint8(p1Move) - uint8(games[entryHash].player2Move)) % 3;
        if (result == 1){ // player 1 wins.
            balances[p1Sender] = balances[p1Sender].add(betSize.mul(2));
            emit LogWinnerFound(entryHash, p1Sender, p2Sender, betSize);

        } else if (result == 2) { // player 2 wins.
            balances[p2Sender] = balances[p2Sender].add(betSize.mul(2));
            emit LogWinnerFound(entryHash, p2Sender, p1Sender, betSize);

        } else { // draw.
            balances[p1Sender] = balances[p1Sender].add(betSize);
            balances[p2Sender] = balances[p2Sender].add(betSize);
            emit LogDrawGame(entryHash, p1Sender, p2Sender, betSize);
        }

        // Game complete. Keep player2Move != 0 to differentiate from NotInPlay state.
        games[entryHash].player2Sender = address(0);
        games[entryHash].bet = 0;
        games[entryHash].gameDeadline = 0;
    }

    function cancelNoJoin(bytes32 entryHash)
        public
        whenNotPaused
        whenAlive
    {
        require(getStatusWithPlayer1Restriction(entryHash) == Status.WaitingForJoin, "Not allowed in game's current state.");
        require(now > games[entryHash].gameDeadline, 'Join period not expired.');

        balances[msg.sender] = balances[msg.sender].add(games[entryHash].bet);
        emit LogCancelNoJoin(entryHash, msg.sender);
        resetCancelledGame(entryHash);
    }

    function cancelNoPlay(bytes32 entryHash)
        public
        whenNotPaused
        whenAlive
    {
        require(getStatusWithPlayer1Restriction(entryHash) == Status.WaitingForPlay, "Not allowed in game's current state.");
        require(now > games[entryHash].gameDeadline, 'Play period not expired.');

        balances[msg.sender] = balances[msg.sender].add(games[entryHash].bet.mul(2));
        emit LogCancelNoPlay(entryHash, msg.sender);
        resetCancelledGame(entryHash);
    }

    function cancelNoUnlock(bytes32 entryHash)
        public
        whenNotPaused
        whenAlive
    {
        require(getStatusWithPlayer2Restriction(entryHash) == Status.WaitingForUnlock, "Not allowed in game's current state.");
        require(now > games[entryHash].gameDeadline, 'Unlock period not expired.');

        balances[msg.sender] = balances[msg.sender].add(games[entryHash].bet.mul(2));
        emit LogCancelNoUnlock(entryHash, msg.sender);
        resetCancelledGame(entryHash);
    }

    function resetCancelledGame(bytes32 entryHash)
        internal
        whenNotPaused
        whenAlive
    {
        Game memory zero;
        games[entryHash] = zero;
    }

    function hashIt(bytes32 code, Action move)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(code, move, address(this), msg.sender));
    }

    function transferOwnership(address newOwner)
        public
        whenAlive
    {
        Ownable.transferOwnership(newOwner);

        if (!isPauser(newOwner)){
            addPauser(newOwner);
        }
    }

    function killedWithdrawal()
        public
        whenKilled
        onlyOwner
    {
        uint256 contractBalance = address(this).balance;

        require(contractBalance > 0, "Contract balance is 0.");
        emit LogKilledWithdrawal(msg.sender, contractBalance);
        msg.sender.transfer(contractBalance);
    }

    function ()
        external
    {
        revert('Reverting fallback');
    }

}
