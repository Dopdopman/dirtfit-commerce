'use client';

/**
 * Render millimeter-accurate 2D Enduro / Motocross CAD silhouette inside an SVG coordinate viewport.
 * Anchors faithfully to exact projected coordinates from `BikeGeometrySpec` (`rearWheel`, `frontWheel`,
 * `swingarm`, `forkLine`, `chassisLoop`, `seatProfile`, `handlebar`, `footpeg`) while layering
 * characteristic off-road bodywork (USD forks, high MX fenders, tank shrouds, engine bashplate, exhaust).
 * @param {object} props
 * @param {object} props.svgWireframe
 * @param {'primary'|'ghost'|'dark'} [props.variant]
 * @param {number} [props.opacity]
 * @returns {import('react').JSX.Element|null}
 */
export default function ParametricBikeSvg({ svgWireframe, variant = 'primary', opacity = 1 }) {
  if (!svgWireframe) {
    return null;
  }

  const isGhost = variant === 'ghost';
  const strokeColor = isGhost ? '#0284C7' : variant === 'dark' ? '#E4E6EB' : '#1C1E21';
  const subStroke = isGhost ? '#0369A1' : variant === 'dark' ? '#9CA3AF' : '#52565E';
  const accentColor = isGhost ? '#0284C7' : variant === 'dark' ? '#FF6B3D' : '#E84C1E';
  const tireStroke = isGhost ? '#0284C7' : variant === 'dark' ? '#9CA3AF' : '#262930';
  const bodyFill = isGhost
    ? 'rgba(2, 132, 199, 0.08)'
    : variant === 'dark'
      ? 'rgba(255, 255, 255, 0.06)'
      : 'rgba(28, 30, 33, 0.06)';
  const engineFill = isGhost
    ? 'rgba(2, 132, 199, 0.10)'
    : variant === 'dark'
      ? 'rgba(255, 255, 255, 0.09)'
      : 'rgba(46, 50, 59, 0.14)';

  const rear = svgWireframe.rearWheel;
  const front = svgWireframe.frontWheel;
  const pivot = svgWireframe.swingarm[1];
  const steeringHead = svgWireframe.forkLine[1];
  const frameRear = svgWireframe.chassisLoop[2];
  const [seatBack, seatPocket, seatFront] = svgWireframe.seatProfile;
  const grip = svgWireframe.handlebar[1];
  const peg = svgWireframe.footpeg;

  const spanPx = Math.max(120, front.center.x - rear.center.x);
  const scale = spanPx / 450; // ~1.0 at standard 860px viewport

  const lerpPt = (a, b, t) => ({
    x: Math.round((a.x + (b.x - a.x) * t) * 10) / 10,
    y: Math.round((a.y + (b.y - a.y) * t) * 10) / 10,
  });

  // Fork USD segments & triple clamp markers
  const forkLowerEnd = lerpPt(front.center, steeringHead, 0.44);
  const forkLowerClamp = lerpPt(front.center, steeringHead, 0.84);
  const forkMid = lerpPt(front.center, steeringHead, 0.72);

  // High MX front fender anchored under lower triple clamp, sweeping over front knobby tire
  const frontFenderStart = {
    x: forkLowerClamp.x - 16 * scale,
    y: forkLowerClamp.y + 4 * scale,
  };
  const frontFenderTip = {
    x: front.center.x + front.tireRadiusPx * 0.78,
    y: front.center.y - front.tireRadiusPx - 14 * scale,
  };
  const frontFenderCtrl = {
    x: front.center.x + 12 * scale,
    y: front.center.y - front.tireRadiusPx - 26 * scale,
  };

  // Enduro headlight / number-plate cowl
  const cowlPoints = [
    `${steeringHead.x - 2 * scale},${steeringHead.y - 6 * scale}`,
    `${steeringHead.x + 22 * scale},${steeringHead.y + 10 * scale}`,
    `${forkLowerClamp.x + 15 * scale},${forkLowerClamp.y + 4 * scale}`,
    `${forkLowerClamp.x - 4 * scale},${forkLowerClamp.y - 2 * scale}`,
  ].join(' ');

  // High MX rear tail fender sweeping cleanly above rear knobby tire
  const rearTailStart = { x: seatBack.x + 8 * scale, y: seatBack.y + 2 * scale };
  const rearTailTip = {
    x: rear.center.x - rear.tireRadiusPx * 0.92,
    y: seatBack.y - 12 * scale,
  };
  const rearTailBottom = {
    x: rear.center.x - rear.tireRadiusPx * 0.62,
    y: seatBack.y + 10 * scale,
  };

  // Sculpted Fuel Tank + Radiator Shroud contour (above main frame down toward fork)
  const shroudPath = [
    `M ${seatFront.x - 8 * scale} ${seatFront.y + 4 * scale}`,
    `L ${steeringHead.x - 4 * scale} ${steeringHead.y + 4 * scale}`,
    `L ${forkMid.x - 8 * scale} ${forkMid.y + 22 * scale}`,
    `L ${peg.x + 56 * scale} ${peg.y - 34 * scale}`,
    `L ${seatPocket.x + 10 * scale} ${seatPocket.y + 26 * scale}`,
    'Z',
  ].join(' ');

  // Side number plate / airbox triangle connecting subframe & swingarm
  const sidePanelPath = [
    `M ${seatBack.x + 16 * scale} ${seatBack.y + 10 * scale}`,
    `L ${seatPocket.x - 4 * scale} ${seatPocket.y + 10 * scale}`,
    `L ${pivot.x + 10 * scale} ${pivot.y - 12 * scale}`,
    `L ${rear.center.x + rear.tireRadiusPx * 0.25} ${seatBack.y + 38 * scale}`,
    'Z',
  ].join(' ');

  // Engine block + crankcase + skid/bashplate nestled between swingarm pivot, peg & steering head
  const engTopFront = { x: peg.x + 64 * scale, y: peg.y - 38 * scale };
  const engTopRear = { x: peg.x + 8 * scale, y: peg.y - 46 * scale };
  const engBotRear = { x: peg.x - 6 * scale, y: peg.y + 10 * scale };
  const engBotFront = { x: peg.x + 56 * scale, y: peg.y + 12 * scale };
  const enginePath = [
    `M ${engTopRear.x} ${engTopRear.y}`,
    `L ${engTopFront.x} ${engTopFront.y}`,
    `L ${engBotFront.x} ${engBotFront.y}`,
    `L ${engBotRear.x} ${engBotRear.y}`,
    'Z',
  ].join(' ');

  // Exhaust header + high-swept Enduro silencer
  const exhaustPoints = [
    `${engTopFront.x - 8 * scale},${engTopFront.y + 14 * scale}`,
    `${engTopFront.x + 12 * scale},${engTopFront.y + 26 * scale}`,
    `${peg.x + 28 * scale},${peg.y - 8 * scale}`,
    `${pivot.x + 4 * scale},${pivot.y - 26 * scale}`,
    `${rear.center.x + rear.tireRadiusPx * 0.15},${seatBack.y + 16 * scale}`,
    `${rear.center.x - rear.tireRadiusPx * 0.56},${seatBack.y + 10 * scale}`,
  ].join(' ');

  // Rear shock absorber (monoshock coil angle from subframe to swingarm)
  const shockTop = { x: frameRear.x + 14 * scale, y: frameRear.y + 6 * scale };
  const shockBot = lerpPt(rear.center, pivot, 0.72);

  // Tapered Enduro Swingarm body polygon
  const swingarmUpperRear = { x: rear.center.x, y: rear.center.y - 4 * scale };
  const swingarmLowerRear = { x: rear.center.x, y: rear.center.y + 5 * scale };
  const swingarmUpperPivot = { x: pivot.x, y: pivot.y - 8 * scale };
  const swingarmLowerPivot = { x: pivot.x, y: pivot.y + 8 * scale };
  const swingarmPoly = [
    `${swingarmUpperRear.x},${swingarmUpperRear.y}`,
    `${swingarmUpperPivot.x},${swingarmUpperPivot.y}`,
    `${swingarmLowerPivot.x},${swingarmLowerPivot.y}`,
    `${swingarmLowerRear.x},${swingarmLowerRear.y}`,
  ].join(' ');

  // Wire-spoke angles for front & rear wheels
  const spokeAngles = [0, 30, 60, 90, 120, 150];
  const renderWheelSpokes = (wheel) =>
    spokeAngles.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * wheel.rimRadiusPx;
      const dy = Math.sin(rad) * wheel.rimRadiusPx;
      return (
        <line
          key={`${wheel.center.x}-${deg}`}
          x1={wheel.center.x - dx}
          y1={wheel.center.y - dy}
          x2={wheel.center.x + dx}
          y2={wheel.center.y + dy}
          stroke={subStroke}
          strokeWidth="0.9"
          strokeOpacity="0.45"
        />
      );
    });

  // Contoured MX saddle cushion polygon matching exact seatProfile line
  const seatPolygon = [
    `${seatBack.x},${seatBack.y}`,
    `${seatPocket.x},${seatPocket.y}`,
    `${seatFront.x},${seatFront.y}`,
    `${seatFront.x - 10 * scale},${seatFront.y + 12 * scale}`,
    `${seatPocket.x},${seatPocket.y + 11 * scale}`,
    `${seatBack.x + 6 * scale},${seatBack.y + 11 * scale}`,
  ].join(' ');

  return (
    <g style={{ opacity }}>
      {/* Rear Wheel: Knobby Off-Road Tire, Rim, Spokes & Wave Rotor */}
      <circle
        cx={rear.center.x}
        cy={rear.center.y}
        r={rear.tireRadiusPx - 1.5}
        fill="none"
        stroke={tireStroke}
        strokeWidth={Math.max(4, 5.5 * scale)}
        strokeDasharray={`${5 * scale} ${3.2 * scale}`}
        strokeOpacity="0.9"
      />
      <circle
        cx={rear.center.x}
        cy={rear.center.y}
        r={rear.tireRadiusPx - 4 * scale}
        fill="none"
        stroke={tireStroke}
        strokeWidth={Math.max(3, 4 * scale)}
        strokeOpacity="0.88"
      />
      {renderWheelSpokes(rear)}
      <circle
        cx={rear.center.x}
        cy={rear.center.y}
        r={rear.rimRadiusPx}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
      />
      <circle
        cx={rear.center.x}
        cy={rear.center.y}
        r={rear.rimRadiusPx * 0.42}
        fill="none"
        stroke={subStroke}
        strokeWidth="1.4"
        strokeDasharray="3 2"
      />

      {/* Front Wheel: 21" Knobby Tire, Rim, Spokes & Oversized Brake Rotor */}
      <circle
        cx={front.center.x}
        cy={front.center.y}
        r={front.tireRadiusPx - 1.5}
        fill="none"
        stroke={tireStroke}
        strokeWidth={Math.max(4, 5.5 * scale)}
        strokeDasharray={`${5 * scale} ${3.2 * scale}`}
        strokeOpacity="0.9"
      />
      <circle
        cx={front.center.x}
        cy={front.center.y}
        r={front.tireRadiusPx - 4 * scale}
        fill="none"
        stroke={tireStroke}
        strokeWidth={Math.max(3, 4 * scale)}
        strokeOpacity="0.88"
      />
      {renderWheelSpokes(front)}
      <circle
        cx={front.center.x}
        cy={front.center.y}
        r={front.rimRadiusPx}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
      />
      <circle
        cx={front.center.x}
        cy={front.center.y}
        r={front.rimRadiusPx * 0.48}
        fill="none"
        stroke={subStroke}
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />

      {/* Side Number Plate & Fuel Tank / Radiator Shrouds */}
      <path d={sidePanelPath} fill={bodyFill} stroke={subStroke} strokeWidth="1.5" />
      <path
        d={shroudPath}
        fill={bodyFill}
        stroke={strokeColor}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      {/* Radiator Louver Vent Accent */}
      <line
        x1={forkMid.x - 4 * scale}
        y1={forkMid.y + 18 * scale}
        x2={peg.x + 58 * scale}
        y2={peg.y - 24 * scale}
        stroke={accentColor}
        strokeWidth="1.6"
        strokeOpacity="0.8"
      />

      {/* Engine Cylinder, Crankcase & Bashplate */}
      <path
        d={enginePath}
        fill={engineFill}
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle
        cx={peg.x + 14 * scale}
        cy={peg.y - 10 * scale}
        r={10 * scale}
        fill="none"
        stroke={subStroke}
        strokeWidth="1.4"
      />
      {/* Bashplate Skid Guard */}
      <polyline
        points={`${engBotRear.x - 4 * scale},${engBotRear.y + 2 * scale} ${engBotFront.x + 6 * scale},${engBotFront.y + 2 * scale} ${engTopFront.x + 4 * scale},${engBotFront.y - 8 * scale}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* High-Swept Enduro Exhaust & Silencer Canister */}
      <polyline
        points={exhaustPoints}
        fill="none"
        stroke={subStroke}
        strokeWidth={Math.max(2.2, 3 * scale)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Rear Mono-Shock Coil + Tapered Swingarm */}
      <line
        x1={shockTop.x}
        y1={shockTop.y}
        x2={shockBot.x}
        y2={shockBot.y}
        stroke={accentColor}
        strokeWidth={Math.max(2.5, 4 * scale)}
        strokeDasharray="3 2"
      />
      <polygon
        points={swingarmPoly}
        fill={bodyFill}
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Perimeter Main Frame & Subframe */}
      <polyline
        points={svgWireframe.chassisLoop.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* High-Mounted MX Front & Rear Fenders */}
      <path
        d={`M ${frontFenderStart.x} ${frontFenderStart.y} Q ${frontFenderCtrl.x} ${frontFenderCtrl.y} ${frontFenderTip.x} ${frontFenderTip.y}`}
        fill="none"
        stroke={accentColor}
        strokeWidth={Math.max(2.5, 3.6 * scale)}
        strokeLinecap="round"
      />
      <polygon
        points={`${rearTailStart.x},${rearTailStart.y} ${rearTailTip.x},${rearTailTip.y} ${rearTailBottom.x},${rearTailBottom.y}`}
        fill={bodyFill}
        stroke={accentColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Inverted USD Front Fork (Upper Outer Stanchion + Lower Inner Tube + Triple Clamps + Cowl) */}
      <line
        x1={steeringHead.x}
        y1={steeringHead.y}
        x2={forkLowerEnd.x}
        y2={forkLowerEnd.y}
        stroke={strokeColor}
        strokeWidth={Math.max(4, 6 * scale)}
        strokeLinecap="round"
      />
      <line
        x1={forkLowerEnd.x}
        y1={forkLowerEnd.y}
        x2={front.center.x}
        y2={front.center.y}
        stroke={subStroke}
        strokeWidth={Math.max(2.6, 3.8 * scale)}
        strokeLinecap="round"
      />
      <polygon
        points={cowlPoints}
        fill={bodyFill}
        stroke={strokeColor}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />

      {/* Contoured MX Saddle anchored strictly to BikeGeometrySpec Seat Profile */}
      <polygon
        points={seatPolygon}
        fill={isGhost ? 'rgba(2, 132, 199, 0.16)' : accentColor}
        fillOpacity={isGhost ? 0.25 : 0.18}
        stroke={accentColor}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <polyline
        points={svgWireframe.seatProfile.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={accentColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Handlebar Riser & Dirtbike Grip Bar */}
      <polyline
        points={`${steeringHead.x},${steeringHead.y} ${grip.x},${grip.y}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx={grip.x} cy={grip.y} r="3.6" fill={accentColor} />

      {/* Footpeg & Axle Telemetry Anchors */}
      <rect x={peg.x - 4.5} y={peg.y - 3} width="9" height="6" rx="1" fill={accentColor} />
      <circle cx={rear.center.x} cy={rear.center.y} r="3.8" fill={accentColor} />
      <circle cx={front.center.x} cy={front.center.y} r="3.8" fill={accentColor} />
    </g>
  );
}
