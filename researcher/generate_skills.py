import argparse
import os
import json
from google import genai
from shared.schemas.skill import SkillList

def generate_skills(job_prompt: str, output_file: str):
    client = genai.Client()
    
    prompt = f"""
Decompose the role '{job_prompt}' into a comprehensive flat list of discrete skills required for the job.
All skills should have status 'stub' since they haven't been trained yet.
"""
    
    interaction = client.interactions.create(
        model="gemini-3.8-flash",
        input=prompt,
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": SkillList.model_json_schema()
        },
    )

    os.makedirs(os.path.dirname(output_file) if os.path.dirname(output_file) else '.', exist_ok=True)
    
    with open(output_file, 'w') as f:
        parsed = json.loads(interaction.output_text)
        json.dump(parsed, f, indent=2)
        
    print(f"Generated skill list saved to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a skill list for a job prompt.")
    parser.add_argument("job_prompt", type=str, help="The job prompt (e.g., 'barista')")
    parser.add_argument("output_file", type=str, nargs="?", default="skills.json", help="Output JSON file path")
    args = parser.parse_args()
    
    generate_skills(args.job_prompt, args.output_file)
