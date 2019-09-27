pragma solidity 0.5.10;

import './Ownable.sol';

contract RockPaperScissors is Ownable, Killable {

    enum Action
    {
        Null, Rock, Paper, Scissors
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
    0 - Not in play: player1Sender == 0
    1 - Waiting for P2 to join: player1Sender != 0 && player2Sender == 0
    2 - Waiting for P2 to submit move: player2Sender != 0 && player2Move == 0
    3 - Waiting for P1 to unlock move: player2Move != 0 && gameDeadline != 0
    4 - Game complete: player2Move != 0 && gameDeadline == 0 */

    function getStatus(bytes32 entryHash)
        public
        view
        whenAlive
        returns (uint8)
    {
        if ((games[entryHash].player1Sender != address(0)) && (games[entryHash].player2Sender == address(0))){
            return 1;
        } else if ((games[entryHash].player2Sender != address(0)) && (games[entryHash].player2Move == Action.Null)){
            return 2;
        } else if ((games[entryHash].player2Move != Action.Null) && (games[entryHash].gameDeadline != 0)){
            return 3;
        } else if ((games[entryHash].player2Move != Action.Null) && (games[entryHash].gameDeadline == 0)){
            return 4;
        }else{
            return 0;
            }
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

    function enrol(bytes32 entryHash)
        public
        payable
        whenNotPaused
        whenAlive
        returns (uint256)
    {
        // Status 4 - Game complete: player2Move!=0 && gameDeadline==0
        // !(player2Move!=0 && gameDeadline==0) = player2Move==0 || gameDeadline!=0
        require((games[entryHash].player2Move == Action.Null) || (games[entryHash].gameDeadline != 0), 'Cannot re-use hash.');

        require((games[entryHash].player1Sender == address(0)), 'Existing game in progress.');

        /* The null condition for players 1 and 2 in this contract is address(0).
        In other words,address(0) is taken to be the case where there is no player.
        As such, address(0) is not allowed to be a player in this contract. */
        require(msg.sender != address(0), 'Address 0 not allowed.');

        games[entryHash].bet = msg.value;
        games[entryHash].player1Sender = msg.sender;
        games[entryHash].gameDeadline = now.add(playPeriod);

        emit LogEnrol(entryHash, msg.sender, msg.value);
    }

    function join(bytes32 entryHash)
        public
        payable
        whenNotPaused
        whenAlive
    {
        require(games[entryHash].player1Sender != address(0), 'No current player. Use enrol to start a game.');
        require(games[entryHash].player2Sender == address(0), 'All player slots taken for this game.');
        require(msg.sender != address(0), 'Address 0 not allowed.');
        require(games[entryHash].bet == msg.value, 'Please send the exact bet amount to join the game.');

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
        require(games[entryHash].player2Sender == msg.sender, "You have not joined the game.");
        require(games[entryHash].player2Move == Action.Null, "You have already played your move.");
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
        require(games[entryHash].player2Move != Action.Null, 'Cannot unlock before player 2 has played.');
        require(games[entryHash].gameDeadline != 0, 'This game has been completed.');
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

        // Game complete. Attributes defined as player2Move != 0, gameDeadline = 0 for this state.
        games[entryHash].player1Sender = address(0);
        games[entryHash].player2Sender = address(0);
        games[entryHash].bet = 0;
        games[entryHash].gameDeadline = 0;
    }

    function cancelNoJoin(bytes32 entryHash)
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == games[entryHash].player1Sender, 'Only player 1 is allowed to call this function.');
        require(games[entryHash].player2Sender == address(0), 'Opponent exists.');
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
        require(msg.sender == games[entryHash].player1Sender, 'Only player 1 is allowed to call this function.');
        require(games[entryHash].player2Sender != address(0), 'No opponent. Use "cancelNoJoin" to cancel.');
        require(games[entryHash].player2Move == Action.Null, 'Not allowed. Please unlock your move.');
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
        require(msg.sender == games[entryHash].player2Sender, 'Only player 2 is allowed to call this function.');
        require(games[entryHash].player2Move != Action.Null, 'Player 2 has not submitted thier move yet.');
        require(games[entryHash].gameDeadline != 0, 'This game has been completed.');
        require(now > games[entryHash].gameDeadline, 'Unlock period not expired.');

        balances[msg.sender] = balances[msg.sender].add(games[entryHash].bet.mul(2));
        emit LogCancelNoUnlock(entryHash, msg.sender);
        resetCancelledGame(entryHash);
    }

    function resetCancelledGame(bytes32 entryHash)
        // internal
        public
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
