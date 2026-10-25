// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title ShiftProof - verifiable load-shift rewards
/// @notice AI may recommend WHEN to shift load, but the reward is decided only by
///         the fixed, public rules in this contract. Meter data is anchored as hashes
///         by a trusted oracle (a documented limitation of this prototype).
/// @dev All energy values are integers in Wh (Solidity has no decimals).
contract ShiftProof {
    uint256 public constant HOURS = 24;
    uint256 public constant LOOKBACK = 4; // number of same-weekday history days
    uint256 public constant WEEK = 7;

    address public immutable oracle; // anchors meter-data hashes
    address public immutable operator; // announces reward events

    struct Anchor {
        bytes32 hash;
        uint64 anchoredAt;
    }

    struct ShiftEvent {
        uint32 eventDay;
        uint32 eligibleMask; // bit h set => hour h is an eligible (solar) hour
        uint32 capWh;
        uint64 announcedAt;
        uint64 deadline;
    }

    // meterId => dayId => anchor
    mapping(bytes32 => mapping(uint32 => Anchor)) public anchors;
    mapping(uint256 => ShiftEvent) public shiftEvents;
    mapping(uint256 => mapping(bytes32 => bool)) public settled;
    mapping(uint256 => mapping(bytes32 => uint256)) public rewardWh;

    event DayAnchored(bytes32 indexed meterId, uint32 indexed dayId, bytes32 hash);
    event EventAnnounced(uint256 indexed eventId, uint32 eventDay, uint32 eligibleMask, uint32 capWh, uint64 deadline);
    event Settled(uint256 indexed eventId, bytes32 indexed meterId, uint256 rewardWh);

    error NotOracle();
    error NotOperator();
    error AlreadyAnchored();
    error EventExists();
    error InvalidEvent();
    error EventNotFound();
    error AlreadySettled();
    error DeadlinePassed();
    error HistoryNotAnchored(uint32 dayId);
    error HistoryAnchoredLate(uint32 dayId);
    error HashMismatch(uint32 dayId);
    error ActualNotAnchored();

    constructor(address _oracle, address _operator) {
        oracle = _oracle;
        operator = _operator;
    }

    /// @notice Canonical hash of one day of readings. Python/JS must encode identically:
    ///         keccak256(abi.encodePacked(bytes32 meterId, uint32 dayId, uint32[24] readingsWh))
    function hashDay(bytes32 meterId, uint32 dayId, uint32[24] memory readings) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(meterId, dayId, readings));
    }

    /// @notice Oracle anchors the hash of a day's readings (history days or the event day).
    function anchorDay(bytes32 meterId, uint32 dayId, bytes32 hash) external {
        if (msg.sender != oracle) revert NotOracle();
        if (anchors[meterId][dayId].anchoredAt != 0) revert AlreadyAnchored();
        anchors[meterId][dayId] = Anchor(hash, uint64(block.timestamp));
        emit DayAnchored(meterId, dayId, hash);
    }

    /// @notice Operator announces an event. History must have been anchored BEFORE this call.
    function announceEvent(
        uint256 eventId,
        uint32 eventDay,
        uint32 eligibleMask,
        uint32 capWh,
        uint64 deadline
    ) external {
        if (msg.sender != operator) revert NotOperator();
        if (shiftEvents[eventId].announcedAt != 0) revert EventExists();
        if (
            eventDay < LOOKBACK * WEEK ||
            eligibleMask == 0 ||
            (eligibleMask >> HOURS) != 0 ||
            capWh == 0 ||
            deadline <= block.timestamp
        ) revert InvalidEvent();

        shiftEvents[eventId] = ShiftEvent(eventDay, eligibleMask, capWh, uint64(block.timestamp), deadline);
        emit EventAnnounced(eventId, eventDay, eligibleMask, capWh, deadline);
    }

    /// @notice Settle one meter for one event, exactly once.
    /// @dev The CONTRACT picks the 4 history days (eventDay-7, -14, -21, -28), so a
    ///      participant cannot cherry-pick high-usage days. Each submitted day must match
    ///      its anchored hash, and must have been anchored before the event was announced.
    function settle(
        uint256 eventId,
        bytes32 meterId,
        uint32[24][4] calldata history,
        uint32[24] calldata actual
    ) external returns (uint256 reward) {
        ShiftEvent memory ev = shiftEvents[eventId];
        if (ev.announcedAt == 0) revert EventNotFound();
        if (block.timestamp > ev.deadline) revert DeadlinePassed();
        if (settled[eventId][meterId]) revert AlreadySettled();

        for (uint256 k = 0; k < LOOKBACK; k++) {
            uint32 d = ev.eventDay - uint32(WEEK * (k + 1));
            Anchor memory a = anchors[meterId][d];
            if (a.anchoredAt == 0) revert HistoryNotAnchored(d);
            if (a.anchoredAt >= ev.announcedAt) revert HistoryAnchoredLate(d);
            if (hashDay(meterId, d, history[k]) != a.hash) revert HashMismatch(d);
        }

        Anchor memory ea = anchors[meterId][ev.eventDay];
        if (ea.anchoredAt == 0) revert ActualNotAnchored();
        if (hashDay(meterId, ev.eventDay, actual) != ea.hash) revert HashMismatch(ev.eventDay);

        reward = _reward(ev, history, actual);
        settled[eventId][meterId] = true;
        rewardWh[eventId][meterId] = reward;
        emit Settled(eventId, meterId, reward);
    }

    /// @dev baseline[h] = floor(mean of the 4 same-weekday readings at hour h)
    ///      drop    = sum over NON-eligible hours of max(0, baseline - actual)
    ///      rise    = sum over eligible hours of max(0, actual - baseline)
    ///      rebound = max(0, actualTotal - baselineTotal)
    ///      reward  = max(0, min(drop, rise, cap) - rebound)
    function _reward(
        ShiftEvent memory ev,
        uint32[24][4] calldata h,
        uint32[24] calldata actual
    ) internal pure returns (uint256) {
        uint256 drop;
        uint256 rise;
        uint256 baseTotal;
        uint256 actTotal;
        for (uint256 hr = 0; hr < HOURS; hr++) {
            uint256 base = (uint256(h[0][hr]) + h[1][hr] + h[2][hr] + h[3][hr]) / LOOKBACK;
            uint256 act = actual[hr];
            baseTotal += base;
            actTotal += act;
            if (((ev.eligibleMask >> hr) & 1) == 1) {
                if (act > base) rise += act - base;
            } else {
                if (base > act) drop += base - act;
            }
        }
        uint256 shifted = drop < rise ? drop : rise;
        if (shifted > ev.capWh) shifted = ev.capWh;
        uint256 rebound = actTotal > baseTotal ? actTotal - baseTotal : 0;
        return shifted > rebound ? shifted - rebound : 0;
    }
}
