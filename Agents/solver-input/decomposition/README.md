# Decomposition prototypes

Three scripts used to test whether the deep postflop solves can be split into
turn subgames rather than solved whole. They are prototypes kept because they
produced the measurements in `Agents/mtt-completion-roadmap.md`, not a finished
pipeline.

- `extract_subgame.py` - pull a turn node out of a monolithic dump: the weighted
  ranges arriving for both players, and the strategy the monolith plays there,
  which is the answer a re-solve has to match.
- `build_and_compare.py` - solve that node on its own with the same action set,
  then score it against the monolith per hand class, weighted by how often each
  class actually arrives.
- `compare_ranges.py` - compare the ranges a cheap flop pass delivers to a node
  against the ranges the monolith carries there. This is what showed the cheap
  pass abandons slowplays.

Two facts worth keeping for whoever picks this up.

The solver takes a four-card board and weighted ranges (`AA:1.0,KK:0.5`), which
is what makes a turn subgame expressible at all. Both were tested.

A flop pass only needs `set_dump_rounds 1`. Round 2 on a flop solve writes the
whole turn layer, which is hundreds of megabytes and was what made several runs
appear to fail without an error - the solve had finished and the dump had not.
Reach probabilities into the turn need only the flop strategies, so round 1 is
enough.
