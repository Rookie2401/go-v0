/**
 * Home is the small directory: Reading, Scripture and Testimony, with settings and vocabulary utilities.
 * Reading recommendations and continuation belong to the Reading surface.
 */
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import { teamLabel } from '../format';
import { I } from '../ui';
import { Stage0Entry } from '../stage0/Stage0Entry';


const ENTRIES: Array<{ to: string; name: string; sub: string }> = [
  { to: '/read', name: 'Reading', sub: 'Stories and dialogues' },
  { to: '/listen', name: 'GoListen', sub: 'Understand stories and Scripture by listening' },
  { to: '/scripture', name: 'Scripture', sub: 'The Bible, prepared for you' },
  { to: '/testimony', name: 'Testimony', sub: 'Write it in your own words' },
  { to: '/team-texts', name: 'Team Texts', sub: 'GoRead — what your team reads' },
];

export function Home() {
  const { user, course, features } = useApp();

  return (
    <div className="page home route-fade">
      <h1 className="home__title">Go</h1>
      <p className="home__subtitle">Welcome, {user.displayName}</p>
      <p className="home__course label">{teamLabel(course)}</p>
      <div className="home__rule" />

      <nav className="home__list" aria-label="Start here">
        <Stage0Entry />
        {ENTRIES.filter((e) => e.to !== '/listen' || features.listen).map((e) => (
          <Link key={e.to} to={e.to} className="home__entry">
            <span className="home__entry-body">
              <span className="home__entry-name">{e.name}</span>
              <span className="home__entry-sub">{e.sub}</span>
            </span>
            <span className="home__entry-go" aria-hidden="true">{I.chevronRight}</span>
          </Link>
        ))}
      </nav>

      <p className="home__links">
        <Link to="/settings">Settings</Link>
        <Link to="/vocabulary">Vocabulary</Link>
      </p>
    </div>
  );
}
