pragma solidity 0.5.10;

import './Killable.sol';

contract RockPaperScissors is Killable{

    enum Action
    {
        Null, Rock, Paper, Scissors
    }

    struct Player
    {
        uint256 bet;
        bytes32 entryHash;
        address sender;
        Action move;
    }

    mapping (address => uint256) balances;
    mapping (bytes32 => bool) usedHashes;
    Player player1;
    Player player2;
    uint256 public constant playPeriod = 1 hours;
    uint256 public constant unlockPeriod = 2 hours;
    uint256 playDeadline;
    uint256 unlockDeadline;
    address owner;

    // Remember to add in LogEvents.
    event LogDeposit(address indexed sender, uint256 amount);
    event LogWithdraw(address indexed sender, uint256 amount);
    event LogEnrol(address indexed sender, uint256 indexed bet, bytes32 indexed entryHash);
    event LogPlay(address indexed sender, uint256 indexed bet, Action indexed move);
    event LogUnlock(address indexed sender, Action indexed move);
    event LogCancelNoOpponent(address indexed sender);
    event LogCancelNoUnlock(address indexed sender);
    event LogTransferOwnership(address indexed owner, address indexed newOwner);
    event LogKilledWithdrawal(address indexed sender, uint256 amount);


    using SafeMath for uint256;

    constructor()
    public
    {
        owner = msg.sender;
    }

    modifier onlyOwner()
    {
        require (msg.sender == owner);
        _;
    }

    function deposit()
        public
        payable
        whenNotPaused
        whenAlive
    {
        require(msg.sender != address(0), 'Sender Error');
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
        uint256 currentBalance = balances[msg.sender];
        balances[msg.sender] = currentBalance.sub(withdrawAmount);
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
        require(player1.sender != address(0), 'No current player.');
        return player1.bet;
    }

    function enrol(bytes32 entryHash, uint256 bet)
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender != address(0), "Player error.");
        require(player1.sender == address(0), 'Player 1 taken. Use "play" to play against player 1');
        require(player2.sender == address(0), 'Game in progress');
        require(!usedHashes[entryHash], 'Cannot re-use hash.');

        uint256 currentBalance = balances[msg.sender];
        balances[msg.sender] = currentBalance.sub(bet);
        player1.bet = bet;
        player1.entryHash = entryHash;
        player1.sender = msg.sender;
        playDeadline = now.add(playPeriod);

        emit LogEnrol(msg.sender, bet, entryHash);

        usedHashes[entryHash] = true;
    }

    function play(uint256 bet, uint8 move)
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender != address(0), "Player error.");
        require(player1.sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2.sender == address(0), 'Game in progress');
        require(bet == player1.bet, 'Bet size must be same as current player');
        require((0 < move) && (move < 4), 'Ineligible move.');

        uint256 currentBalance = balances[msg.sender];
        balances[msg.sender] = currentBalance.sub(bet);
        player2.bet = bet;
        player2.move = Action(move);
        player2.sender = msg.sender;
        unlockDeadline = now.add(unlockPeriod);

        emit LogPlay(msg.sender, bet, Action(move));
    }

    function unlock(bytes32 code, uint8 move)
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender != address(0), "Player error.");
        require(player1.sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2.move != Action.Null, 'Cannot unlock before player 2 has played.');
        require((0 < move) && (move < 4), 'Ineligible move.');
        require(msg.sender == player1.sender, 'Unknown player.');
        require(hashIt(code, move) == player1.entryHash, 'Unverified move.');
        require(player1.move == Action.Null, 'Cannot re-play move.');

        player1.move = Action(move);
        emit LogUnlock(msg.sender, Action(move));
        evaluate();
    }

    function evaluate()
        internal
        whenNotPaused
        whenAlive
    {
        int8 p1Move = int8(player1.move);
        int8 p2Move = int8(player2.move);
        uint256 betSize = player1.bet; // player bets already forced to be equal.
        address p1Sender = player1.sender;
        address p2Sender = player2.sender;

        if (p1Move == p2Move){
            balances[p1Sender] = balances[p1Sender].add(betSize);
            balances[p2Sender] = balances[p2Sender].add(betSize);

        } else {
            int8 result = p1Move - p2Move;
            if ((result == 1) || (result == -2)){
                balances[p1Sender] = balances[p1Sender].add(betSize).add(betSize);
            } else {
                balances[p2Sender] = balances[p2Sender].add(betSize).add(betSize);
            }
        }
        // Log
        // Game complete. Reset Game.
        resetGame();
    }

    function cancelNoOpponent()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player1.sender, 'Not currently enrolled.');
        require(player2.sender == address(0), 'Opponent exists.');
        require(now > playDeadline, 'Enrol period not expired');

        balances[msg.sender] = balances[msg.sender].add(player1.bet);
        resetGame();
        emit LogCancelNoOpponent(msg.sender);
    }

    function cancelNoUnlock()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player2.sender, 'Only player 2 allowed to call this function.');
        require(player1.move == Action.Null, 'Player 1 already unlocked their move.');
        require(now > unlockDeadline, 'Play period not expired.');

        balances[msg.sender] = balances[msg.sender].add(player1.bet).add(player2.bet);
        resetGame();
        emit LogCancelNoUnlock(msg.sender);
    }

    function resetGame()
        internal
        whenNotPaused
        whenAlive
    {
        player1.bet = 0;
        player1.entryHash = 0;
        player1.sender = address(0);
        player1.move = Action.Null;

        player2.bet = 0;
        player2.entryHash = 0;
        player2.sender = address(0);
        player2.move = Action.Null;

        playDeadline = 0;
        unlockDeadline = 0;
    }

    function hashIt(bytes32 code, uint8 move)
        public
        view
        whenNotPaused
        whenAlive
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(code, move, address(this), msg.sender));
    }

    function transferOwnership(address newOwner)
        public
        whenPaused
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
