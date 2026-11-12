// Single-threaded stand-ins for <thread>/<mutex>/<condition_variable>
// used by the WebAssembly (browser) build of Patricia. With Threads=1 the
// engine never spawns helper threads, so these only need to be no-ops.
#pragma once
#include <utility>
namespace std {
struct mutex { void lock() {} void unlock() {} bool try_lock() { return true; } };
template <class M> struct unique_lock {
  explicit unique_lock(M &) {}
  void lock() {} void unlock() {}
};
template <class M> unique_lock(M &) -> unique_lock<M>;
struct condition_variable {
  template <class L, class P> void wait(L &, P pred) { (void)pred; }
  void notify_all() {} void notify_one() {}
};
struct thread {
  thread() = default;
  template <class F, class... A> explicit thread(F &&f, A &&...a) {
    std::forward<F>(f)(std::forward<A>(a)...);
  }
  bool joinable() const { return false; }
  void join() {}
};
} // namespace std
namespace std { namespace this_thread { inline void yield() {} template <class D> void sleep_for(const D &) {} } }
