"""Shared SHAP-coverage computation (P6b).

One canonical definition of "how much of the loaded ensemble's blend do the
SHAP explanations cover", used by all three consumers so they can never
drift apart:

  1. ``ModelRegistry.recomputed_shap_coverage()`` — the registry's own
     view of the loaded (post-pruning, renormalised) ensemble.
  2. ``LiveExplanationService.explain()`` — the live /predict coverage
     block returned with every prediction.
  3. ``GET /api/v1/model/explainability`` (backend/app/services/
     explainability.py) — the Explainability screen's coverage donut,
     which recomputes the same shares from the same loaded weights
     instead of quoting the notebook-time manifest.

The rule (Cell 9.4's additivity note): ``shap.TreeExplainer`` explains the
tree members (xgb, catboost) exactly; non-tree members (TabNet) are not
covered.  With renormalised weights that sum to 1:

    tree_share_explained_by_shap = w_xgb + w_catboost
    tabnet_share_not_covered      = sum of the weights of every other
                                    kept member (0 when none are kept —
                                    the typical pruned-TabNet case means
                                    tree_share = 1.0)

Both shares are fractions in [0, 1] and sum to the total weight of the
kept ensemble (1.0 for a correctly renormalised set).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

#: Tree members ``shap.TreeExplainer`` can explain.  TabNet is excluded by
#: construction — it's a neural net, not a tree model.  Defined here (not
#: in explain.py) so registry.py can import it without a circular import.
TREE_MEMBERS: tuple[str, ...] = ("xgb", "catboost")


def shap_coverage_from_weights(
    members: Sequence[str] | None,
    weights: Mapping[str, float] | None,
) -> dict[str, Any]:
    """Compute the SHAP-coverage shares for a loaded member set.

    Parameters
    ----------
    members:
        The kept members, in the ensemble's member order (e.g.
        ``registry.kept_members``).
    weights:
        The renormalised weight per kept member (e.g.
        ``registry.kept_weights``).  Members missing from ``weights``
        contribute 0.

    Returns
    -------
    dict with the documented keys — all shares are fractions in [0, 1]:
      - ``tree_share_explained_by_shap`` — sum of tree-member weights
      - ``tabnet_share_not_covered`` — sum of non-tree-member weights
        (the share of the blend SHAP does NOT explain)
      - ``explained_members`` — kept members SHAP covers, in member order
      - ``unexplained_members`` — kept members SHAP does not cover
    """
    members = list(members or [])
    weights = weights or {}

    tree_share = 0.0
    tabnet_share = 0.0
    explained: list[str] = []
    unexplained: list[str] = []
    for member in members:
        w = float(weights.get(member, 0.0))
        if member in TREE_MEMBERS:
            tree_share += w
            explained.append(member)
        else:
            tabnet_share += w
            unexplained.append(member)

    return {
        "tree_share_explained_by_shap": round(tree_share, 6),
        "tabnet_share_not_covered": round(tabnet_share, 6),
        "explained_members": explained,
        "unexplained_members": unexplained,
    }
