pragma solidity 0.5.10;

import './Killable.sol';

contract RockPaperScissors is Killable{

    struct Player
    {
        uint256 bet;
        bytes32 entryHash;
        address sender;
        uint8 move;
    }

    mapping (address => uint256) balances;
    mapping (bytes32 => bool) usedHashes;
    Player player1;
    Player player2;
    uint8 public constant rock = 1;
    uint8 public constant paper = 2;
    uint8 public constant scissors = 3;
    uint256 public constant enrolPeriod = 1 hours;
    uint256 public constant playPeriod = 2 hours;
    uint256 enrolDeadline;
    uint256 playDeadline;
    address owner;

    // Remember to add in LogEvents.
    event LogDeposit(address indexed sender, uint256 indexed amount);
    event LogWithdraw(address indexed sender, uint256 indexed amount);
    event LogEnrol(address indexed sender, uint256 indexed bet, bytes32 indexed entryHash);
    event LogPlay(address indexed sender, uint8 indexed move);
    event LogCancel_NoOpponent(address indexed sender);
    event LogCancel_NoPlay(address indexed sender);
    event LogCancel_Override(address indexed sender);
    event LogTransferOwnership(address indexed owner, address indexed newOwner);
    event LogKilledWithdrawal(address indexed sender, uint256 indexed amount);


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

    function viewBalance()
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
        require(currentBalance >= withdrawAmount, "Not enough funds.");
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
        require(player2.sender == address(0), 'Game in progress');
        require(msg.sender != address(0), 'Player error.');
        require(usedHashes[entryHash] == false, 'Cannot re-use hash.');

        uint256 currentBalance = balances[msg.sender];
        require(bet <= currentBalance, 'Not enough funds.');

        if (player1.sender == address(0)){
            balances[msg.sender] = currentBalance.sub(bet);
            player1.bet = bet;
            player1.entryHash = entryHash;
            player1.sender = msg.sender;
            enrolDeadline = now.add(enrolPeriod);

        }else {
            require(bet == player1.bet, 'Bet size must be same as current player');
            balances[msg.sender] = currentBalance.sub(bet);
            player2.bet = bet;
            player2.entryHash = entryHash;
            player2.sender = msg.sender;
            playDeadline = now.add(playPeriod);
        }

        emit LogEnrol(msg.sender, bet, entryHash);

        usedHashes[entryHash] = true;
    }

    function play(bytes32 code, uint8 move)
        public
        whenNotPaused
        whenAlive
    {
        require(player2.sender != address(0), 'Not enough entries.');
        require((0 < move) && (move < 4), 'Ineligible move.');
        require(msg.sender != address(0), "Player error.");

        if (msg.sender == player1.sender){
            require(hashIt(code, move) == player1.entryHash, 'Unverified move.');
            require(player1.move == 0, 'Cannot re-play move.');

            player1.move = move;

        } else if (msg.sender == player2.sender){
            require(hashIt(code, move) == player2.entryHash, 'Unverified move.');
            require(player2.move == 0, 'Cannot re-play move.');

            player2.move = move;

        } else {
            revert('Unknown player.');
        }

        emit LogPlay(msg.sender, move);

        if ((player1.move != 0) && (player2.move != 0)){
            evaluate();
        }
    }

    function evaluate()
        internal
        whenNotPaused
        whenAlive
    {
        uint8 p1Move = player1.move;
        uint8 p2Move = player2.move;
        uint256 betSize = player1.bet; // player bets forced to be equal.
        address p1Sender = player1.sender;
        address p2Sender = player2.sender;

        if (p1Move == p2Move){
            balances[p1Sender] = balances[p1Sender].add(betSize);
            balances[p2Sender] = balances[p2Sender].add(betSize);

        } else if (p1Move == rock){
            if (p2Move == paper){
                balances[p2Sender] = balances[p2Sender].add(betSize).add(betSize);
            }
            else if (p2Move == scissors){
                balances[p1Sender] = balances[p1Sender].add(betSize).add(betSize);
            }

        } else if (p1Move == paper){
            if (p2Move == scissors){
                balances[p2Sender] = balances[p2Sender].add(betSize).add(betSize);
            }
            else if (p2Move == rock){
                balances[p1Sender] = balances[p1Sender].add(betSize).add(betSize);
            }

        } else if (p1Move == scissors){
            if (p2Move == rock){
                balances[p2Sender] = balances[p2Sender].add(betSize).add(betSize);
            }
            else if (p2Move == paper){
                balances[p1Sender] = balances[p1Sender].add(betSize).add(betSize);
            }
        }

        // Log
        // Game complete. Reset Game.
        resetGame();
        enrolDeadline = 0;
        playDeadline = 0;
    }

    function cancel_NoOpponent()
        public
        whenNotPaused
        whenAlive
    {
        require(msg.sender == player1.sender, 'Not currently enrolled.');
        require(player2.sender == address(0), 'Opponent exists.');
        require(now > enrolDeadline, 'Enrol period not expired');

        uint256 betValue = player1.bet;

        player1.bet = 0;
        player1.entryHash = 0;
        player1.move = 0;
        enrolDeadline = 0;
        emit LogCancel_NoOpponent(msg.sender);
        balances[player1.sender] = balances[player1.sender].add(betValue);
        player1.sender = address(0);
    }

    function cancel_NoPlay()
        public
        whenNotPaused
        whenAlive
    {
        require(now > playDeadline, 'Play period not expired.');
        if (msg.sender == player1.sender){
            require(player1.move != 0, 'You have not played.');
            require(player2.move == 0, 'Other player already played.');
        }else if (msg.sender == player2.sender){
            require(player2.move != 0, 'You have not played.');
            require(player1.move == 0, 'Other player already played.');
        }
        else{
            revert('You are not currently enrolled in a game.');
        }

        uint256 betValue = player1.bet.add(player2.bet);
        resetGame();
        playDeadline = 0;
        enrolDeadline = 0;
        emit LogCancel_NoPlay(msg.sender);
        balances[msg.sender] = balances[msg.sender].add(betValue);
    }

    function cancel_Override()
        public
        whenNotPaused
        whenAlive
        onlyOwner
    {
        require(now > playDeadline, 'Play period not expired.');
        require(player1.move == 0, 'Player 1 already played');
        require(player2.move == 0, 'Player 2 already played');

        uint256 betValue = player1.bet.add(player2.bet);
        resetGame();
        playDeadline = 0;
        enrolDeadline = 0;
        emit LogCancel_Override(msg.sender);
        balances[owner] = balances[owner].add(betValue);
    }


    function resetGame()
        internal
        whenNotPaused
        whenAlive
    {
        player1.bet = 0;
        player1.entryHash = 0;
        player1.sender = address(0);
        player1.move = 0;

        player2.bet = 0;
        player2.entryHash = 0;
        player2.sender = address(0);
        player2.move = 0;
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
