/**
 * Whether a value is a bare object literal rather than an instance of
 * some class.
 *
 * The geometric types accept both - a Point, and the `{x, y}` that was
 * the only thing they returned before these classes existed - but a
 * BoxType must not claim a LineSegment just because it carries the same
 * four numbers, so the shape check is limited to plain objects.
 */
function isPlainObject(v: any): boolean {
  return (
    v !== null &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function isNum(v: any): boolean {
  return typeof v === 'number';
}

/** A `point`: one position. */
export class Point {
  x: number;
  y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /** As PostgreSQL prints it, so it casts back through `::point`. */
  toString(): string {
    return `(${this.x},${this.y})`;
  }

  toJSON(): string {
    return this.toString();
  }

  /* c8 ignore next 3 */
  static isPointLike(v: any): boolean {
    return (
      isPlainObject(v) &&
      Object.keys(v).length === 2 &&
      isNum(v.x) &&
      isNum(v.y)
    );
  }
}

/** A `circle`: a centre and a radius. */
export class Circle {
  x: number;
  y: number;
  r: number;

  constructor(x: number = 0, y: number = 0, r: number = 0) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  /** As PostgreSQL prints it, so it casts back through `::circle`. */
  toString(): string {
    return `<(${this.x},${this.y}),${this.r}>`;
  }

  toJSON(): string {
    return this.toString();
  }

  static isCircleLike(v: any): boolean {
    return (
      isPlainObject(v) &&
      Object.keys(v).length === 3 &&
      isNum(v.x) &&
      isNum(v.y) &&
      isNum(v.r)
    );
  }
}

/**
 * Two corners, which is how both `box` and `lseg` are carried - and why
 * they are two classes rather than one shared shape. They were
 * indistinguishable as plain objects: both types' isType() accepted
 * `{x1, y1, x2, y2}`, so `determine()` answered `box` for every one of
 * them and an lseg parameter could not be expressed at all.
 */
abstract class TwoPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  constructor(x1: number = 0, y1: number = 0, x2: number = 0, y2: number = 0) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }

  toJSON(): string {
    return this.toString();
  }

  static isTwoPointsLike(v: any): boolean {
    return (
      isPlainObject(v) &&
      Object.keys(v).length === 4 &&
      isNum(v.x1) &&
      isNum(v.y1) &&
      isNum(v.x2) &&
      isNum(v.y2)
    );
  }
}

/** A `box`: a rectangle given by two opposite corners. */
export class Box extends TwoPoints {
  /** As PostgreSQL prints it, so it casts back through `::box`. */
  toString(): string {
    return `(${this.x1},${this.y1}),(${this.x2},${this.y2})`;
  }
}

/** An `lseg`: the straight line between two points. */
export class LineSegment extends TwoPoints {
  /** As PostgreSQL prints it, so it casts back through `::lseg`. */
  toString(): string {
    return `[(${this.x1},${this.y1}),(${this.x2},${this.y2})]`;
  }
}

export { TwoPoints };
