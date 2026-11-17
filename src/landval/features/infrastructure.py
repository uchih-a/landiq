"""Infrastructure score from the parcel checklist — mirrors Notebook 1 Cells 7.3–7.5.

At prediction time the user supplies 0/1 values for the ten infrastructure
items (water, electricity, fencing, structures, internal roads). The score is:

``clip(sum(weight * item) / MAX_INFRA_SCORE * 100, 0, 100)``, rounded 2dp

— identical to Cell 7.4. Mutual exclusivity rules (Cell 7.3) are applied
before scoring. When the user marks every item as "not sure", the county
median is used (Cell 7.5's imputation table), falling back to the global
median.
"""

from __future__ import annotations

import numpy as np


class InfrastructureCalculator:
    """Computes ``infrastructure_score`` from the user's parcel checklist.

    Parameters
    ----------
    scoring_params : dict
        Parsed ``scoring_params.json`` — must contain ``infra_items``
        (``{item: weight}``), ``max_infra_score``,
        ``county_median_infrastructure`` (``{county: median_score}``),
        and ``global_fallback_infrastructure``.
    """

    def __init__(self, scoring_params: dict):
        self.infra_items: dict[str, float] = {
            k: float(v) for k, v in scoring_params["infra_items"].items()
        }
        self.max_infra_score = float(scoring_params["max_infra_score"])
        self.county_medians: dict[str, float] = {
            k: float(v) for k, v in scoring_params.get("county_median_infrastructure", {}).items()
        }
        self.global_fallback = float(scoring_params.get("global_fallback_infrastructure", 8.70))

    def _apply_exclusivity(self, presence: dict[str, int]) -> dict[str, int]:
        """Cell 7.3 — mutual exclusivity rules.

        The stronger feature takes precedence when both are detected:
        - full_fence + partial_fence → drop partial_fence
        - borehole + water_tank      → drop water_tank
        - grid_electric + solar      → drop solar_electric
        """
        p = dict(presence)  # don't mutate the input

        if p.get("full_fence") == 1 and p.get("partial_fence") == 1:
            p["partial_fence"] = 0

        if p.get("borehole") == 1 and p.get("water_tank") == 1:
            p["water_tank"] = 0

        if p.get("grid_electric") == 1 and p.get("solar_electric") == 1:
            p["solar_electric"] = 0

        return p

    def compute_score(
        self,
        parcel_features: dict[str, int | None],
        county: str | None = None,
    ) -> tuple[float, str]:
        """Compute ``infrastructure_score`` from the parcel checklist.

        Parameters
        ----------
        parcel_features : dict
            Keys are the ten infrastructure item names
            (``borehole``, ``piped_water``, …). Values are 0, 1, or None
            (None = "not sure").
        county : str, optional
            Used for the county-median fallback when every item is "not sure".

        Returns
        -------
        (score, source)
            ``source`` is ``"parcel_checklist"`` or ``"imputed_county_median"``
            or ``"imputed_global_median"``.
        """
        # Check if every item is "not sure" (None)
        all_unsure = all(parcel_features.get(item) is None for item in self.infra_items)

        if all_unsure:
            # Cell 7.5 fallback: county median, then global
            if county and county in self.county_medians:
                return self.county_medians[county], "imputed_county_median"
            return self.global_fallback, "imputed_global_median"

        # Build presence dict — None (not sure) treated as 0
        presence: dict[str, int] = {}
        for item in self.infra_items:
            val = parcel_features.get(item)
            presence[item] = int(val) if val is not None else 0

        # Cell 7.3 — apply mutual exclusivity
        presence = self._apply_exclusivity(presence)

        # Cell 7.4 — weighted score
        raw_score = sum(self.infra_items[item] * presence[item] for item in self.infra_items)
        score = np.clip(raw_score / self.max_infra_score * 100, 0, 100)
        return round(float(score), 2), "parcel_checklist"

    def compute_score_from_columns(
        self, infra_columns: dict[str, int], county: str | None = None
    ) -> float:
        """Compute score from the ``infra_<item>`` column dict directly.

        This is the parity-test path: the fixture stores ``infra_borehole``,
        ``infra_piped_water``, etc. as 0/1 columns. This method strips the
        ``infra_`` prefix and delegates to ``compute_score``.
        """
        parcel_features = {
            col.replace("infra_", ""): val
            for col, val in infra_columns.items()
            if col.startswith("infra_")
        }
        score, _ = self.compute_score(parcel_features, county)
        return score
