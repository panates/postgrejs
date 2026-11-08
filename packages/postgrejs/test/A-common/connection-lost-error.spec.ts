import { expect } from 'expect';
import { ConnectionLostError } from 'postgrejs';

describe('ConnectionLostError', () => {
  it('should carry a code so branching need not mean instanceof', () => {
    const err = new ConnectionLostError(1234);
    expect(err.code).toStrictEqual('08006');
    expect(err.processID).toStrictEqual(1234);
    expect(err.name).toStrictEqual('ConnectionLostError');
    expect(err).toBeInstanceOf(Error);
  });

  it('should report the same message other drivers report', () => {
    // Pinned deliberately: callers and test suites match on this string,
    // which is why the process id lives on the object instead of in it.
    expect(new ConnectionLostError().message).toStrictEqual(
      'Connection terminated unexpectedly',
    );
  });

  it('should attach the socket error as its cause when there was one', () => {
    const socketError = new Error('read ECONNRESET');
    const err = new ConnectionLostError(1, socketError);
    expect((err as { cause?: unknown }).cause).toBe(socketError);
    // A clean FIN leaves no socket error behind, and then there is none.
    expect(
      (new ConnectionLostError(1) as { cause?: unknown }).cause,
    ).toBeUndefined();
  });
});
