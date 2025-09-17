"""
Predefiniowane strategie handlowe dla SRinance3 Trading Bot

Każda strategia zawiera:
- Nazwa i opis użytkownika
- Emoji dla UI
- Kompletną konfigurację z parametrami i risk management
"""

from typing import Dict, Any, List


PREDEFINED_STRATEGIES = {
    "conservative_scalping": {
        "name": "Conservative Scalping",
        "description": "Bezpieczny scalping na małych ruchach cenowych z szybkimi transakcjami",
        "emoji": "🛡️",
        "tags": ["Low Risk", "Scalping", "Fast"],
        "config": {
            "type": "simple_ma",
            "symbol": "BTCUSDT",
            "timeframe": "1m",
            "parameters": {
                "ma_period": 10,
                "ma_type": "EMA",
                "threshold": 0.1  # 0.1% threshold for signals
            },
            "risk_management": {
                "max_position_size": 100,
                "stop_loss_pct": 0.005,  # 0.5%
                "take_profit_pct": 0.01,  # 1%
                "max_daily_trades": 20,
                "max_daily_loss": 50
            }
        }
    },
    
    "aggressive_momentum": {
        "name": "Aggressive Momentum", 
        "description": "Agresywna strategia na silnych trendach z większymi zyskami",
        "emoji": "🚀",
        "tags": ["High Risk", "Momentum", "Trends"],
        "config": {
            "type": "rsi",
            "symbol": "BTCUSDT",
            "timeframe": "5m", 
            "parameters": {
                "rsi_period": 14,
                "rsi_overbought": 75,  # More aggressive levels
                "rsi_oversold": 25
            },
            "risk_management": {
                "max_position_size": 500,
                "stop_loss_pct": 0.02,   # 2%
                "take_profit_pct": 0.05,  # 5%
                "max_daily_trades": 10,
                "max_daily_loss": 200
            }
        }
    },
    
    "stable_dca": {
        "name": "Stable DCA",
        "description": "Dollar Cost Averaging dla długoterminowych inwestorów",
        "emoji": "📈", 
        "tags": ["Long Term", "DCA", "Stable"],
        "config": {
            "type": "dca",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "parameters": {
                "dca_interval": 7200,    # 2h between purchases
                "dca_amount": 25,        # $25 per purchase
                "dca_price_drop": 0.03   # 3% drop triggers extra purchase
            },
            "risk_management": {
                "max_position_size": 2000,
                "stop_loss_pct": 0.15,   # 15% (long-term)
                "take_profit_pct": 0.25,  # 25%
                "max_daily_trades": 5,
                "max_daily_loss": 100
            }
        }
    },
    
    "grid_ranging": {
        "name": "Grid Ranging",
        "description": "Siatka zleceń dla rynków bocznych z regularną siłą uczenia",
        "emoji": "🎯",
        "tags": ["Ranging", "Grid", "Sideways"],
        "config": {
            "type": "grid", 
            "symbol": "BTCUSDT",
            "timeframe": "15m",
            "parameters": {
                "grid_levels": 8,
                "grid_spacing": 0.015,   # 1.5% spacing
                "grid_amount": 75        # $75 per grid level
            },
            "risk_management": {
                "max_position_size": 800,
                "stop_loss_pct": 0.08,   # 8%
                "take_profit_pct": 0.12,  # 12%
                "max_daily_trades": 15,
                "max_daily_loss": 150
            }
        }
    }
}


def get_predefined_strategies() -> Dict[str, Dict[str, Any]]:
    """
    Zwróć listę dostępnych predefiniowanych strategii (metadata only)
    
    Returns:
        Dict with strategy keys and their UI metadata (name, description, emoji, tags)
    """
    return {
        key: {
            "name": strategy["name"],
            "description": strategy["description"], 
            "emoji": strategy["emoji"],
            "tags": strategy["tags"]
        }
        for key, strategy in PREDEFINED_STRATEGIES.items()
    }


def get_strategy_config(strategy_key: str) -> Dict[str, Any]:
    """
    Pobierz pełną konfigurację strategii
    
    Args:
        strategy_key: Key strategii z PREDEFINED_STRATEGIES
        
    Returns:
        Complete strategy configuration dict
        
    Raises:
        ValueError: If strategy_key not found
    """
    if strategy_key not in PREDEFINED_STRATEGIES:
        available = list(PREDEFINED_STRATEGIES.keys())
        raise ValueError(f"Unknown strategy: {strategy_key}. Available: {available}")
    
    return PREDEFINED_STRATEGIES[strategy_key]["config"].copy()


def get_strategy_metadata(strategy_key: str) -> Dict[str, Any]:
    """
    Pobierz metadata strategii (bez config)
    
    Args:
        strategy_key: Key strategii
        
    Returns:
        Strategy metadata (name, description, emoji, tags)
    """
    if strategy_key not in PREDEFINED_STRATEGIES:
        raise ValueError(f"Unknown strategy: {strategy_key}")
    
    strategy = PREDEFINED_STRATEGIES[strategy_key]
    return {
        "name": strategy["name"],
        "description": strategy["description"],
        "emoji": strategy["emoji"], 
        "tags": strategy["tags"]
    }


def list_strategy_keys() -> List[str]:
    """Zwróć listę wszystkich kluczy strategii"""
    return list(PREDEFINED_STRATEGIES.keys())


def validate_strategy_config(config: Dict[str, Any]) -> bool:
    """
    Waliduj konfigurację strategii
    
    Args:
        config: Configuration dict to validate
        
    Returns:
        True if valid, False otherwise
    """
    required_fields = ["type", "symbol", "timeframe", "parameters", "risk_management"]
    
    try:
        # Check required top-level fields
        for field in required_fields:
            if field not in config:
                return False
        
        # Check risk management fields
        risk_fields = ["max_position_size", "stop_loss_pct", "take_profit_pct", "max_daily_trades", "max_daily_loss"]
        for field in risk_fields:
            if field not in config["risk_management"]:
                return False
        
        # Basic type validation
        if not isinstance(config["parameters"], dict):
            return False
            
        if not isinstance(config["risk_management"], dict):
            return False
            
        return True
    except (KeyError, TypeError):
        return False


# Export for easy imports
__all__ = [
    "PREDEFINED_STRATEGIES",
    "get_predefined_strategies", 
    "get_strategy_config",
    "get_strategy_metadata",
    "list_strategy_keys",
    "validate_strategy_config"
]