pragma solidity 0.5.10;

import './Ownable.sol';

contract RockPaperScissors is Ownable, Killable {

    enum Action
    {
        Null, Rock, Paper, Scissors
    }

    struct Player
    {
        bytes32 entryHash;
        address sender;
        Action move;
    }

    mapping (address => uint256) balances;
    mapping (bytes32 => bool) usedHashes;
    Player player1;
    Player player2;
    uint256 bet;
    uint256 public constant playPeriod = 1 hours;
    uint256 public constant unlockPeriod = 2 hours;
    uint256 public playDeadline;
    uint256 public unlockDeadline;

    // Remember to add in LogEvents.
    event LogDeposit(address indexed sender, uint256 amount);
    event LogWithdraw(address indexed sender, uint256 amount);
    event LogEnrol(address indexed sender, uint256 indexed bet, bytes32 indexed entryHash);
    event LogPlay(address indexed sender, uint256 indexed bet, Action indexed move);
    event LogUnlock(address indexed sender, Action indexed move);
    event LogWinnerFound(address indexed winner, address indexed loser, uint256 amount);
    event LogDrawGame(address indexed player1, address indexed player2, uint256 amount);
    event LogCancelNoOpponent(address indexed sender);
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
        return bet;
    }

    function enrol(bytes32 entryHash, uint256 newBet)
        public
        payable
        whenNotPaused
        whenAlive
    {
        if (msg.value > 0){
            deposit();
        }

        require(msg.sender != address(0), "Player error.");
        require(player1.sender == address(0), 'Player 1 taken. Use "play" to play against player 1');
        require(player2.sender == address(0), 'Game in progress');
        require(!usedHashes[entryHash], 'Cannot re-use hash.');

        uint256 currentBalance = balances[msg.sender];
        balances[msg.sender] = currentBalance.sub(newBet);
        bet = newBet;
        player1.entryHash = entryHash;
        player1.sender = msg.sender;
        playDeadline = now.add(playPeriod);

        emit LogEnrol(msg.sender, newBet, entryHash);

        usedHashes[entryHash] = true;
    }

    function play(Action move)
        public
        payable
        whenNotPaused
        whenAlive
    {
        if (msg.value > 0){
            deposit();
        }

        require(msg.sender != address(0), "Player error.");
        require(player1.sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2.sender == address(0), 'Game in progress');
        require(move != Action.Null, 'Ineligible move.');

        uint256 currentBet = bet;
        balances[msg.sender] = balances[msg.sender].sub(currentBet);
        player2.move = move;
        player2.sender = msg.sender;
        unlockDeadline = now.add(unlockPeriod);

        emit LogPlay(msg.sender, currentBet, move);
    }

    function unlock(bytes32 code, Action move)
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender != address(0), "Player error.");
        require(player1.sender != address(0), 'No one to play against. Use "enrol" to start a new game.');
        require(player2.move != Action.Null, 'Cannot unlock before player 2 has played.');
        require(move != Action.Null, 'Ineligible move.');
        require(hashIt(code, move) == player1.entryHash, 'Unverified move.');
        require(player1.move == Action.Null, 'Cannot re-play move.');

        player1.move = move;
        emit LogUnlock(msg.sender, move);
        evaluate();
    }

    function evaluate()
        internal
        whenNotPaused
        whenAlive
    {
        uint256 betSize = bet;
        address p1Sender = player1.sender;
        address p2Sender = player2.sender;

        uint8 result = (3 + uint8(player1.move) - uint8(player2.move)) % 3;
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

    function cancelNoOpponent()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player1.sender, 'Not currently enrolled.');
        require(player2.sender == address(0), 'Opponent exists.');
        require(now > playDeadline, 'Enrol period not expired');

        balances[msg.sender] = balances[msg.sender].add(bet);
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

        balances[msg.sender] = balances[msg.sender].add(bet.mul(2));
        resetGame();
        emit LogCancelNoUnlock(msg.sender);
    }

    function resetGame()
        internal
        whenNotPaused
        whenAlive
    {
        player1.entryHash = 0;
        player1.sender = address(0);
        player1.move = Action.Null;

        player2.entryHash = 0;
        player2.sender = address(0);
        player2.move = Action.Null;

        bet = 0;
        playDeadline = 0;
        unlockDeadline = 0;
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
