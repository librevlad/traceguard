// Demo project "BRK — electronic brake control unit".
// Gaps are planted on purpose so the auditor has something real to find:
//   SYS-9  not broken down (ASIL C)            SWR-3  one test only, no fault injection (ASIL D)
//   SWR-4  ASIL B under an ASIL D parent        SWR-6  failing fault-injection test
//   SWR-8  robust test never executed           SWR-9  no test at all (ASIL C)
//   SWR-12 no test (QM)                         SWR-14 orphan requirement
//   SWR-15 safety requirement without ASIL      SWR-16 edited after its tests ran
//   TC-21, TC-22 orphan tests                   TC-23 link to a deleted requirement
const R = (key, level, asil, parent, summary, extra = {}) => ({
  key, level, asil, summary, updated: '2026-10-20T10:00:00Z',
  links: parent ? [].concat(parent).map(p => ({ type: 'derives', target: p })) : [], ...extra,
});
const T = (key, target, method, result, summary, lastRunAt = '2026-11-15T09:00:00Z') => ({
  key, level: 'TEST', method, result, summary, lastRunAt,
  links: target ? [{ type: 'verifies', target }] : [],
});

export const project = { key: 'BRK', name: 'Electronic brake control unit' };

export const items = [
  // Safety goals (from the hazard analysis)
  R('SG-1', 'SG', 'D', null, 'Avoid unintended loss of braking force'),
  R('SG-2', 'SG', 'C', null, 'Avoid unintended braking at high vehicle speed'),

  // System requirements
  R('SYS-1', 'SYS', 'D', 'SG-1', 'Detect loss of hydraulic pressure in either brake circuit within 20 ms'),
  R('SYS-2', 'SYS', 'D', 'SG-1', 'Switch to the redundant brake circuit within 50 ms after a pressure loss'),
  R('SYS-3', 'SYS', 'D', 'SG-1', 'Monitor the brake pedal travel sensor with two independent channels'),
  R('SYS-4', 'SYS', 'C', 'SG-2', 'Do not command braking above 30 km/h without driver demand or an AEB request'),
  R('SYS-5', 'SYS', 'C', 'SG-2', 'Validate AEB brake requests with CRC and alive counter'),
  R('SYS-6', 'SYS', 'QM', null, 'Report brake pad wear to the instrument cluster over CAN once per ignition cycle'),
  R('SYS-7', 'SYS', 'QM', null, 'Store diagnostic trouble codes for sensor faults and serve them over UDS'),
  R('SYS-8', 'SYS', 'D', 'SG-1', 'Keep the two brake circuits hydraulically independent', { allocation: 'hw' }),
  R('SYS-9', 'SYS', 'C', 'SG-2', 'Limit the brake pressure gradient to 150 bar/s outside AEB events'),
  R('SYS-10', 'SYS', 'QM', null, 'Wake up the ECU within 100 ms when the brake pedal is pressed'),

  // Software requirements
  R('SWR-1', 'SWR', 'D', 'SYS-1', 'Sample brake circuit pressure sensors P1 and P2 every 2 ms'),
  R('SWR-2', 'SWR', 'D', 'SYS-1', 'Set PRESSURE_LOSS when P1 or P2 stays below 5 bar for 5 consecutive samples'),
  R('SWR-3', 'SWR', 'D', 'SYS-2', 'On PRESSURE_LOSS switch valve control to the redundant brake circuit'),
  R('SWR-4', 'SWR', 'B', 'SYS-2', 'Log every brake circuit switch event with a timestamp'),
  R('SWR-5', 'SWR', 'D', 'SYS-3', 'Read pedal travel channels A and B and compare them every 5 ms'),
  R('SWR-6', 'SWR', 'D', 'SYS-3', 'Raise PEDAL_SENSOR_FAULT when pedal channels differ by more than 8% for 20 ms'),
  R('SWR-7', 'SWR', 'C', 'SYS-4', 'Reject brake commands above 30 km/h when driver demand is below 10% and no AEB request is active'),
  R('SWR-8', 'SWR', 'C', 'SYS-5', 'Verify the CRC8 of every AEB request frame'),
  R('SWR-9', 'SWR', 'C', 'SYS-5', 'Verify that the alive counter of AEB request frames increments by one per frame'),
  R('SWR-10', 'SWR', 'QM', 'SYS-6', 'Send the BRAKE_WEAR frame 0x3A1 once per ignition cycle'),
  R('SWR-11', 'SWR', 'QM', 'SYS-7', 'Store DTC C1234 when a pressure sensor reads out of range'),
  R('SWR-12', 'SWR', 'QM', 'SYS-7', 'Answer UDS service 0x19 with the list of stored DTCs'),
  R('SWR-13', 'SWR', 'QM', 'SYS-10', 'Start the wake-up sequence on the brake pedal switch interrupt'),
  R('SWR-14', 'SWR', 'QM', null, 'Blink the service LED at 2 Hz while in diagnostic mode'),
  R('SWR-15', 'SWR', undefined, 'SYS-1', 'Filter pressure sensor noise with a 3-sample moving average'),
  R('SWR-16', 'SWR', 'C', 'SYS-4', 'Read vehicle speed from the ESC frame every 10 ms', { updated: '2026-11-20T14:30:00Z' }),

  // Software tests
  T('TC-1', 'SWR-1', 'requirements', 'pass', 'Pressure sensors P1 and P2 are sampled every 2 ms'),
  T('TC-2', 'SWR-1', 'fault-injection', 'pass', 'Inject a stuck P1 sensor and check sampling continues on P2'),
  T('TC-3', 'SWR-2', 'requirements', 'pass', 'PRESSURE_LOSS is set after 5 samples below 5 bar'),
  T('TC-4', 'SWR-2', 'fault-injection', 'pass', 'Inject a pressure drop in circuit 2 and check PRESSURE_LOSS'),
  T('TC-5', 'SWR-3', 'requirements', 'pass', 'Valve control moves to the redundant circuit on PRESSURE_LOSS'),
  T('TC-6', 'SWR-4', 'requirements', 'pass', 'Circuit switch events are logged with a timestamp'),
  T('TC-7', 'SWR-5', 'requirements', 'pass', 'Pedal channels A and B are compared every 5 ms'),
  T('TC-8', 'SWR-5', 'back-to-back', 'pass', 'Back-to-back pedal comparison against the Simulink model'),
  T('TC-9', 'SWR-6', 'fault-injection', 'fail', 'Inject a 10% pedal channel deviation and expect PEDAL_SENSOR_FAULT'),
  T('TC-10', 'SWR-6', 'requirements', 'pass', 'PEDAL_SENSOR_FAULT is raised after 20 ms of deviation'),
  T('TC-11', 'SWR-7', 'requirements', 'pass', 'Brake commands above 30 km/h without demand are rejected'),
  T('TC-12', 'SWR-7', 'fault-injection', 'pass', 'Inject a spurious brake command at 80 km/h and check it is rejected'),
  T('TC-13', 'SWR-8', 'requirements', 'pass', 'AEB frames with a wrong CRC8 are discarded'),
  T('TC-14', 'SWR-8', 'fault-injection', 'none', 'Inject corrupted AEB frames on the bus'),
  T('TC-15', 'SWR-10', 'requirements', 'pass', 'BRAKE_WEAR frame 0x3A1 is sent once per ignition cycle'),
  T('TC-16', 'SWR-11', 'requirements', 'pass', 'DTC C1234 is stored for an out-of-range pressure sensor'),
  T('TC-17', 'SWR-13', 'requirements', 'pass', 'Wake-up sequence starts on the pedal switch interrupt'),
  T('TC-18', 'SWR-16', 'requirements', 'pass', 'Vehicle speed is read from the ESC frame every 10 ms', '2026-11-10T09:00:00Z'),
  T('TC-19', 'SWR-16', 'back-to-back', 'pass', 'Back-to-back vehicle speed decoding against the model', '2026-11-10T09:00:00Z'),
  T('TC-20', 'SWR-15', 'requirements', 'pass', 'Moving average removes single-sample pressure spikes'),
  T('TC-21', null, 'requirements', 'pass', 'Alive counter of AEB frames rolls over from 15 to 0 and still increments by one'),
  T('TC-22', null, 'requirements', 'pass', 'UDS 0x19 response lists every stored DTC'),
  { key: 'TC-23', level: 'TEST', method: 'requirements', result: 'pass', summary: 'Valve response time stays under 10 ms',
    lastRunAt: '2026-11-15T09:00:00Z', links: [{ type: 'verifies', target: 'SWR-99' }] },

  // System tests
  T('TC-24', 'SYS-1', 'fault-injection', 'pass', 'HIL: open a brake line and measure detection time'),
  T('TC-25', 'SYS-1', 'requirements', 'pass', 'HIL: pressure loss is detected within 20 ms'),
  T('TC-26', 'SYS-2', 'fault-injection', 'pass', 'HIL: fail circuit 1 and measure switch-over time'),
  T('TC-27', 'SYS-2', 'requirements', 'pass', 'HIL: redundant circuit takes over within 50 ms'),
  T('TC-28', 'SYS-4', 'requirements', 'pass', 'Vehicle test: no braking above 30 km/h without demand'),
  T('TC-29', 'SYS-4', 'fault-injection', 'pass', 'HIL: spurious brake request at 100 km/h is ignored'),
  T('TC-30', 'SYS-3', 'requirements', 'pass', 'HIL: pedal travel is read on both channels'),
  T('TC-31', 'SYS-3', 'fault-injection', 'pass', 'HIL: disconnect pedal channel B and check the fault reaction'),
  T('TC-32', 'SYS-5', 'requirements', 'pass', 'HIL: AEB frames are validated end to end'),
  T('TC-33', 'SYS-5', 'fault-injection', 'pass', 'HIL: replayed AEB frames are rejected'),
  T('TC-34', 'SYS-10', 'requirements', 'pass', 'Bench: ECU wakes up within 100 ms on pedal press'),
];
