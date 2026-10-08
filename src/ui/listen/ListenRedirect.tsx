/**
 * Old listening links. GoListen has no doorway of its own any more: `/listen` is the Reading page, and `/listen/:textId` is the
 * text in the Reader with its ListenBar open in Listen first (`?listen=1`). Bookmarks and recommendations written before the
 * move keep working. A scripture text goes to its Scripture route; a text this device has not opened yet goes to the Reading
 * route, which opens it from the library as any deep link does.
 */
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context';
import { textPath } from '../format';
import { useListenEnabled } from '../reader/useListen';

export function ListenIndexRedirect() {
  return <Navigate to="/read" replace />;
}

export function ListenTextRedirect() {
  const { textId = '' } = useParams();
  const { store } = useApp();
  const listenOn = useListenEnabled();
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    void store.texts.get(textId).then(
      (text) => text,
      () => undefined,
    ).then((text) => {
      if (!live) return;
      const base = text ? textPath(text) : `/read/${encodeURIComponent(textId)}`;
      navigate(listenOn ? `${base}?listen=1` : base, { replace: true });
    });
    return () => { live = false; };
  }, [store, textId, listenOn, navigate]);
  return null;
}
