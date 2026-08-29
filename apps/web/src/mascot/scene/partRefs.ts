import { useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import type { PartId } from "../model/types.ts";

export type PartRefs = Record<PartId, RefObject<Group | null>>;

export function usePartRefs(): PartRefs {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftEar = useRef<Group>(null);
  const rightEar = useRef<Group>(null);
  const leftEye = useRef<Group>(null);
  const rightEye = useRef<Group>(null);
  const leftWhite = useRef<Group>(null);
  const rightWhite = useRef<Group>(null);
  const leftIris = useRef<Group>(null);
  const rightIris = useRef<Group>(null);
  const leftPupil = useRef<Group>(null);
  const rightPupil = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const fangs = useRef<Group>(null);
  const whiskers = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const leftPaw = useRef<Group>(null);
  const rightPaw = useRef<Group>(null);
  const leftHindPaw = useRef<Group>(null);
  const rightHindPaw = useRef<Group>(null);
  return useMemo(
    () => ({
      root,
      body,
      head,
      leftEar,
      rightEar,
      leftEye,
      rightEye,
      leftWhite,
      rightWhite,
      leftIris,
      rightIris,
      leftPupil,
      rightPupil,
      mouth,
      fangs,
      whiskers,
      tail,
      leftPaw,
      rightPaw,
      leftHindPaw,
      rightHindPaw,
    }),
    [],
  );
}

