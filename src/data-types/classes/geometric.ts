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

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
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

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
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

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
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

/**
 * A `line`: the infinite line Ax + By + C = 0.
 *
 * PostgreSQL stores and prints the three coefficients whatever form the
 * literal took - `line '((0,0),(1,1))'` comes back as `{1,-1,0}` - so
 * that is what this carries. A pair of points would be a second, lossy
 * spelling of the same thing, since a line through them is not the
 * points.
 */
export class Line {
  a: number;
  b: number;
  c: number;

  constructor(a: number = 0, b: number = 0, c: number = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
  }

  /** As PostgreSQL prints it, so it casts back through `::line`. */
  toString(): string {
    return `{${this.a},${this.b},${this.c}}`;
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
    return this.toString();
  }

  static isLineLike(v: any): boolean {
    return (
      isPlainObject(v) &&
      Object.keys(v).length === 3 &&
      isNum(v.a) &&
      isNum(v.b) &&
      isNum(v.c)
    );
  }
}

/**
 * The list of points `path` and `polygon` share. They are two classes
 * rather than one for the same reason `Box` and `LineSegment` are: the
 * values are indistinguishable by shape, so only the class can say which
 * type a parameter is meant for.
 */
abstract class PointList {
  points: Point[];

  /** Plain `{x, y}` objects are accepted and kept as Points. */
  constructor(points: (Point | { x: number; y: number })[] = []) {
    this.points = points.map(p =>
      p instanceof Point ? p : new Point(p.x, p.y),
    );
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
    return this.toString();
  }

  protected join(): string {
    let out = '';
    const l = this.points.length;
    let i: number;
    for (i = 0; i < l; i++) {
      if (i) out += ',';
      out += this.points[i].toString();
    }
    return out;
  }
}

/**
 * A `path`: a series of points, open or closed.
 *
 * Closed is the default because it is PostgreSQL's - a literal written
 * without brackets, `path '1,2,3,4'`, comes back closed. The flag is
 * part of the value and not a formatting choice: the server stores it
 * and prints `[...]` for an open path against `(...)` for a closed one.
 */
export class Path extends PointList {
  isClosed: boolean;

  constructor(
    points: (Point | { x: number; y: number })[] = [],
    isClosed: boolean = true,
  ) {
    super(points);
    this.isClosed = isClosed;
  }

  /** As PostgreSQL prints it, so it casts back through `::path`. */
  toString(): string {
    const inner = this.join();
    return this.isClosed ? `(${inner})` : `[${inner}]`;
  }
}

/** A `polygon`: a closed series of points. */
export class Polygon extends PointList {
  /** As PostgreSQL prints it, so it casts back through `::polygon`. */
  toString(): string {
    return `(${this.join()})`;
  }
}

export { PointList, TwoPoints };
