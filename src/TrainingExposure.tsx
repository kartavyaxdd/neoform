import * as D from './domain';
export function TrainingExposure({sessions,exercises}:{sessions:D.Session[];exercises:D.Exercise[]}){
 const rows=Object.entries(D.muscleExposure(sessions,exercises));
 return <details className="training-exposure" open><summary>Muscle exposure details</summary>
 <div className="table-wrap"><table aria-label="Muscle exposure details"><thead><tr><th>Muscle</th><th>Direct</th><th>Indirect</th><th>Advanced</th><th>Raw</th><th>Visits</th></tr></thead>
 <tbody>{rows.map(([name,r])=><tr key={name}><td>{name}</td><td>{r.directHardSets}</td><td>{r.indirectHardSets}</td><td>{r.advancedBouts}</td><td>{r.rawBouts}</td><td>{r.exposures}</td></tr>)}</tbody></table></div>
 <p className="caption">Direct and indirect hard sets are separate estimates (≤4 RIR). Advanced sequences are raw bouts, not straight-set equivalents. Raw includes completed non-warmup bouts; visits count sessions. Rows can share the same underlying work—do not sum indirect or raw counts across muscles. PDF pp. 43, 59–60, 169, 223, 257.</p>
 </details>;
}
