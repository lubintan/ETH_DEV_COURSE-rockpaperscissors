pragma solidity 0.5.10;

import './Ownable.sol';

contract RockPaperScissors is Ownable, Killable {

    enum Action
    {
        Null, Rock, Paper, Scissors
    }

    enum Status
    {
        NotInPlay, WaitingForJoin, WaitingForPlay, WaitingForUnlock
    }

    mapping (address => uint256) balances;
    mapping (bytes32 => bool) usedHashes;
    bytes32 player1EntryHash;
    address player1Sender;
    Action player2Move;
    address player2Sender;
    Status public status;
    uint256 bet;
    uint256 public constant joinPeriod = 1 hours;
    uint256 public constant playPeriod = 1 hours;
    uint256 public constant unlockPeriod = 2 hours;
    uint256 public joinDeadline;
    uint256 public playDeadline;
    uint256 public unlockDeadline;

    // Remember to add in LogEvents.
    event LogDeposit(address indexed sender, uint256 amount);
    event LogWithdraw(address indexed sender, uint256 amount);
    event LogEnrol(address indexed sender, uint256 indexed bet, bytes32 indexed entryHash);
    event LogJoin(address indexed sender);
    event LogPlay(address indexed sender, Action indexed move);
    event LogUnlock(address indexed sender, Action indexed move);
    event LogWinnerFound(address indexed winner, address indexed loser, uint256 amount);
    event LogDrawGame(address indexed player1, address indexed player2, uint256 amount);
    event LogCancelNoJoin(address indexed sender);
    event LogCancelNoPlay(address indexed sender);
    event LogCancelNoUnlock(address indexed sender);
    event LogKilledWithdrawal(address indexed sender, uint256 amount);


    using SafeMath for uint256;

    constructor() public {}

    function deposit()
        public
        payable
        whenNotPaused
        whenAlive
    {
        require(msg.value != 0, 'No deposit value.');

        emit LogDeposit(msg.sender, msg.value);
        balances[msg.sender] = balances[msg.sender].add(msg.value);
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

    function getCurrentBet()
        public
        view
        whenNotPaused
        whenAlive
        returns (uint256)
    {
        require(player1Sender != address(0), 'No current player.');
        return bet;
    }

    function enrol(bytes32 entryHash, uint256 newBet)
        public
        payable
        whenNotPaused
        whenAlive
    {
        if (msg.value > 0){
            emit LogDeposit(msg.sender, msg.value);
        }

        require(player1Sender == address(0), 'Player 1 taken.');
        require(player2Sender == address(0), 'Game in progress');
        require(!usedHashes[entryHash], 'Cannot re-use hash.');

        balances[msg.sender] = balances[msg.sender].add(msg.value).sub(newBet);
        bet = newBet;
        player1EntryHash = entryHash;
        player1Sender = msg.sender;
        joinDeadline = now.add(playPeriod);

        emit LogEnrol(msg.sender, newBet, entryHash);
        status = Status.WaitingForJoin;

        usedHashes[entryHash] = true;
    }

    function join()
        public
        payable
        whenNotPaused
        whenAlive
    {
        require(player1Sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2Sender == address(0), 'Game in progress');

        if (msg.value > 0){
            emit LogDeposit(msg.sender, msg.value);
        }

        player2Sender = msg.sender;
        balances[msg.sender] = balances[msg.sender].add(msg.value).sub(bet);
        playDeadline = now.add(playPeriod);

        emit LogJoin(msg.sender);
        status = Status.WaitingForPlay;
    }

    function play(Action move)
        public
        whenNotPaused
        whenAlive
    {
        require(player2Sender == msg.sender, "You have not joined the game.");
        require(move != Action.Null, 'Ineligible move.');

        player2Move = move;
        unlockDeadline = now.add(unlockPeriod);

        emit LogPlay(msg.sender, move);
        status = Status.WaitingForUnlock;
    }

    function unlock(bytes32 code, Action move)
        public
        whenNotPaused
        whenAlive
    {
        require(player1Sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2Move != Action.Null, 'Cannot unlock before player 2 has played.');
        require(move != Action.Null, 'Ineligible move.');
        require(hashIt(code, move) == player1EntryHash, 'Unverified move.');

        emit LogUnlock(msg.sender, move);
        evaluate(move);
    }

    function evaluate(Action p1Move)
        internal
        whenNotPaused
        whenAlive
    {
        uint256 betSize = bet;
        address p1Sender = player1Sender;
        address p2Sender = player2Sender;

        uint8 result = (3 + uint8(p1Move) - uint8(player2Move)) % 3;
        if (result == 1){ // player 1 wins.
            balances[p1Sender] = balances[p1Sender].add(betSize.mul(2));
            emit LogWinnerFound(p1Sender, p2Sender, betSize);

        } else if (result == 2) { // player 2 wins.
            balances[p2Sender] = balances[p2Sender].add(betSize.mul(2));
            emit LogWinnerFound(p2Sender, p1Sender, betSize);

        } else { // draw.
            balances[p1Sender] = balances[p1Sender].add(betSize);
            balances[p2Sender] = balances[p2Sender].add(betSize);
            emit LogDrawGame(p1Sender, p2Sender, betSize);
        }
        // Game complete. Reset Game.
        resetGame();
    }

    function cancelNoJoin()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player1Sender, 'Not currently enrolled.');
        require(player2Sender == address(0), 'Opponent exists.');
        require(now > joinDeadline, 'Join period not expired.');

        balances[msg.sender] = balances[msg.sender].add(bet);
        resetGame();
        emit LogCancelNoJoin(msg.sender);
    }

    function cancelNoPlay()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player1Sender, 'Not currently enrolled.');
        require(player2Sender != address(0), 'No opponent. Use CancelNoJoin to cancel.');
        require(player2Move == Action.Null, 'Not allowed. Please unlock your move.');
        require(now > playDeadline, 'Play period not expired.');

        balances[msg.sender] = balances[msg.sender].add(bet.mul(2));
        resetGame();
        emit LogCancelNoPlay(msg.sender);
    }


    function cancelNoUnlock()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player2Sender, 'Only player 2 allowed to call this function.');
        require(now > unlockDeadline, 'Unlock period not expired.');

        balances[msg.sender] = balances[msg.sender].add(bet.mul(2));
        resetGame();
        emit LogCancelNoUnlock(msg.sender);
    }

    function resetGame()
        internal
        whenNotPaused
        whenAlive
    {
        player1EntryHash = 0;
        player1Sender = address(0);

        player2Sender = address(0);
        player2Move = Action.Null;

        bet = 0;
        joinDeadline = 0;
        playDeadline = 0;
        unlockDeadline = 0;

        status = Status.NotInPlay;
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
