'use client';

/**
 * Layer 4 articulated rider anatomical vector bound to the 8 kinematics.js joint coordinates.
 * @param {object} props
 * @param {object} props.joints
 * @param {boolean} [props.darkMode]
 * @param {string} [props.contactTone]
 * @returns {import('react').JSX.Element|null}
 */
export default function RiderFigureSvg({ joints, darkMode = false, contactTone = 'flat' }) {
  if (!joints) {
    return null;
  }

  const limbPrimary = darkMode ? '#F3F4F6' : '#111214';
  const limbSecondary = darkMode ? '#9CA3AF' : '#52565E';
  const jointDot = '#E84C1E';
  const bootFill =
    contactTone === 'flat'
      ? '#15803D'
      : contactTone === 'balls'
        ? '#B45309'
        : contactTone === 'unsafe'
          ? '#B91C1C'
          : '#C2410C';

  return (
    <g>
      {/* Torso (Hip -> Shoulder) */}
      <line
        x1={joints.hip.x}
        y1={joints.hip.y}
        x2={joints.shoulder.x}
        y2={joints.shoulder.y}
        stroke={limbPrimary}
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Leg (Hip -> Knee -> Ankle) */}
      <line
        x1={joints.hip.x}
        y1={joints.hip.y}
        x2={joints.knee.x}
        y2={joints.knee.y}
        stroke={limbPrimary}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <line
        x1={joints.knee.x}
        y1={joints.knee.y}
        x2={joints.ankle.x}
        y2={joints.ankle.y}
        stroke={limbSecondary}
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Riding Boot Foot Segment (Ankle -> FootContact) */}
      <line
        x1={joints.ankle.x}
        y1={joints.ankle.y}
        x2={joints.footContact.x}
        y2={joints.footContact.y}
        stroke={bootFill}
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Arm (Shoulder -> Elbow -> Wrist) */}
      <line
        x1={joints.shoulder.x}
        y1={joints.shoulder.y}
        x2={joints.elbow.x}
        y2={joints.elbow.y}
        stroke={limbPrimary}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <line
        x1={joints.elbow.x}
        y1={joints.elbow.y}
        x2={joints.wrist.x}
        y2={joints.wrist.y}
        stroke={limbSecondary}
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* MX Helmet Contour */}
      <circle
        cx={joints.headCenter.x}
        cy={joints.headCenter.y}
        r="19"
        fill={darkMode ? '#1F2937' : '#FFFFFF'}
        stroke={limbPrimary}
        strokeWidth="2.5"
      />
      <path
        d={`M ${joints.headCenter.x + 8} ${joints.headCenter.y - 12} L ${joints.headCenter.x + 28} ${joints.headCenter.y - 16}`}
        stroke={jointDot}
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Key Biomechanical Joint Nodes */}
      {[joints.hip, joints.knee, joints.ankle, joints.shoulder, joints.elbow, joints.wrist].map(
        (pt, idx) => (
          <circle key={idx} cx={pt.x} cy={pt.y} r="3.2" fill={jointDot} />
        )
      )}
    </g>
  );
}
